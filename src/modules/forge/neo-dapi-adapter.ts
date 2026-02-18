/**
 * Neo dAPI Adapter
 *
 * Normalizes differences between NeoLine, OneGate, and Neon Wallet behind
 * a single interface. Business logic and UI components only interact with
 * this adapter — never with window.NEOLine or window.OneGate directly.
 */

import { WALLET_STORAGE_KEY } from "./forge-config";
import type { ForgeParams, UpdateParams, WalletBalance, WalletType } from "./types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the user rejects a transaction in their wallet. */
export class WalletRejectedError extends Error {
  constructor(message = "User rejected the transaction") {
    super(message);
    this.name = "WalletRejectedError";
  }
}

/** Thrown when no wallet is connected and an operation requires one. */
export class WalletNotConnectedError extends Error {
  constructor() {
    super("No wallet connected");
    this.name = "WalletNotConnectedError";
  }
}

// ---------------------------------------------------------------------------
// dAPI window type declarations
// ---------------------------------------------------------------------------

interface NeoDapiAccount {
  address: string;
  label?: string;
}

interface NeoDapiBalance {
  contract: string;
  symbol: string;
  amount: string;
}

interface NeoDapiInvokeResult {
  txid: string;
  nodeURL?: string;
}

interface NeoDapi {
  getAccount(): Promise<NeoDapiAccount>;
  getBalance(params: { params: { address: string }[] }): Promise<{ address: string; balances: NeoDapiBalance[] }[]>;
  invoke(params: {
    scriptHash: string;
    operation: string;
    args: unknown[];
    fee?: string;
    description?: string;
  }): Promise<NeoDapiInvokeResult>;
  AddNEP17(params: { scriptHash: string; symbol: string; decimals: number }): Promise<void>;
}

declare global {
  interface Window {
    NEOLine?: { Neo: new () => NeoDapi };
    NEOLineN3?: { Neo: new () => NeoDapi };
    OneGate?: {
      neo: { getAccount(): Promise<NeoDapiAccount> };
      invoke(params: unknown): Promise<NeoDapiInvokeResult>;
      getBalance(params: unknown): Promise<unknown>;
    };
    neon?: NeoDapi;
  }
}

// ---------------------------------------------------------------------------
// Wallet detection
// ---------------------------------------------------------------------------

export interface InstalledWallet {
  type: WalletType;
  name: string;
}

/** Returns all Neo dAPI-compatible wallets currently detected in `window`. */
export function detectInstalledWallets(): InstalledWallet[] {
  if (typeof window === "undefined") return [];

  const wallets: InstalledWallet[] = [];
  if (window.NEOLineN3 ?? window.NEOLine) wallets.push({ type: "NeoLine", name: "NeoLine" });
  if (window.OneGate) wallets.push({ type: "OneGate", name: "OneGate" });
  if (window.neon) wallets.push({ type: "Neon", name: "Neon Wallet" });
  return wallets;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _connectedAddress: string | null = null;
let _walletType: WalletType = "disconnected";
let _dapi: NeoDapi | null = null;

function getDapi(type: WalletType): NeoDapi {
  switch (type) {
    case "NeoLine": {
      const Ctor = window.NEOLineN3?.Neo ?? window.NEOLine?.Neo;
      if (!Ctor) throw new WalletNotConnectedError();
      return new Ctor();
    }
    case "OneGate":
      if (!window.OneGate) throw new WalletNotConnectedError();
      // OneGate exposes a compatible interface on window.OneGate
      return window.OneGate as unknown as NeoDapi;
    case "Neon":
      if (!window.neon) throw new WalletNotConnectedError();
      return window.neon;
    default:
      throw new WalletNotConnectedError();
  }
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** Connects to the specified wallet and returns the user's address. */
export async function connect(type: WalletType): Promise<string> {
  const dapi = getDapi(type);
  const account = await dapi.getAccount();
  _connectedAddress = account.address;
  _walletType = type;
  _dapi = dapi;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(WALLET_STORAGE_KEY, type);
  }
  return account.address;
}

/** Clears the in-memory connection state (does not revoke wallet permission). */
export function disconnect(): void {
  _connectedAddress = null;
  _walletType = "disconnected";
  _dapi = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }
}

/** Returns the currently connected address, or null if disconnected. */
export function getAddress(): string | null {
  return _connectedAddress;
}

/** Returns the currently connected wallet type. */
export function getWalletType(): WalletType {
  return _walletType;
}

/**
 * Attempts to reconnect using the wallet type saved in localStorage.
 * Returns the address if successful, null otherwise.
 */
export async function tryAutoReconnect(): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  const saved = localStorage.getItem(WALLET_STORAGE_KEY) as WalletType | null;
  if (!saved || saved === "disconnected") return null;
  try {
    return await connect(saved);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/** Returns NEP-17 balances for the connected wallet address. */
export async function getBalances(address: string): Promise<WalletBalance[]> {
  if (!_dapi) throw new WalletNotConnectedError();

  const results = await _dapi.getBalance({
    params: [{ address }],
  });

  const entry = results[0];
  if (!entry) return [];

  return entry.balances.map((b) => {
    const amount = BigInt(b.amount);
    return {
      contractHash: b.contract,
      symbol: b.symbol,
      amount,
      decimals: 8, // dAPI doesn't return decimals — callers should override from RPC
      displayAmount: formatBalance(amount, 8),
    };
  });
}

function formatBalance(raw: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  const whole = raw / factor;
  const frac = raw % factor;
  const fracStr = frac.toString().padStart(decimals, "0");
  return `${whole}.${fracStr}`;
}

// ---------------------------------------------------------------------------
// Invoke helpers
// ---------------------------------------------------------------------------

function isWalletRejection(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("cancel") || msg.includes("reject") || msg.includes("denied")) return true;
  }
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    const type = String(obj.type ?? "").toUpperCase();
    if (type === "CANCELED" || type === "CANCELLED" || type === "REJECTED") return true;
    const msg = String(obj.message ?? "").toLowerCase();
    if (msg.includes("cancel") || msg.includes("reject")) return true;
  }
  return false;
}

/**
 * Submits a token creation transaction to the TokenFactory via GAS transfer.
 * The factory's onNEP17Payment handler receives [name, symbol, supply, decimals, "community"].
 * Throws WalletRejectedError if the user cancels in their wallet.
 */
export async function invokeForge(
  factoryHash: string,
  feeAmount: bigint,
  params: ForgeParams
): Promise<string> {
  if (!_dapi) throw new WalletNotConnectedError();

  const data = [
    params.name,
    params.symbol,
    params.supply.toString(),
    params.decimals,
    params.mode,
  ];

  try {
    const result = await _dapi.invoke({
      scriptHash: "0xd2a4cff31913016155e38e474a2c06d08be276cf", // GAS hash
      operation: "transfer",
      args: [
        { type: "Hash160", value: _connectedAddress },
        { type: "Hash160", value: factoryHash },
        { type: "Integer", value: feeAmount.toString() },
        { type: "Array", value: data.map((v) => ({ type: "Any", value: v })) },
      ],
      description: `Forge token: ${params.name} (${params.symbol})`,
    });
    return result.txid;
  } catch (err) {
    if (isWalletRejection(err)) throw new WalletRejectedError();
    throw err;
  }
}

/**
 * Submits a token update transaction.
 * Throws WalletRejectedError if the user cancels.
 */
export async function invokeUpdate(
  tokenHash: string,
  params: UpdateParams
): Promise<string> {
  if (!_dapi) throw new WalletNotConnectedError();

  try {
    const result = await _dapi.invoke({
      scriptHash: tokenHash,
      operation: "update",
      args: [
        { type: "String", value: params.name },
        { type: "String", value: params.symbol },
      ],
      description: `Update token: ${params.name}`,
    });
    return result.txid;
  } catch (err) {
    if (isWalletRejection(err)) throw new WalletRejectedError();
    throw err;
  }
}

/**
 * Calls the wallet's AddNEP17 API to add a token to the wallet's asset list.
 * No-op if the wallet doesn't support this API.
 */
export async function addNEP17Token(
  contractHash: string,
  symbol: string,
  decimals: number
): Promise<void> {
  if (!_dapi) return;
  try {
    await _dapi.AddNEP17({ scriptHash: contractHash, symbol, decimals });
  } catch {
    // Non-critical — ignore if wallet doesn't support it
  }
}
