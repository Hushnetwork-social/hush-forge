/**
 * Neo dAPI Adapter
 *
 * Normalizes differences between NeoLine, OneGate, and Neon Wallet behind
 * a single interface. Business logic and UI components only interact with
 * this adapter — never with window.NEOLine or window.OneGate directly.
 */

import { GAS_CONTRACT_HASH, PRIVATE_NET_RPC_URL, WALLET_STORAGE_KEY } from "./forge-config";
import { getTokenBalance } from "./neo-rpc-client";
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

interface NeoDapiSigner {
  account: string;
  scopes: "None" | "CalledByEntry" | "CustomContracts" | "CustomGroups" | "Global";
  allowedContracts?: string[];
  allowedGroups?: string[];
}

interface NeoDapi {
  getAccount(): Promise<NeoDapiAccount>;
  getNetworks(): Promise<{ networks: string[]; defaultNetwork: string }>;
  getBalance(params: { params: { address: string }[] }): Promise<{ address: string; balances: NeoDapiBalance[] }[]>;
  invoke(params: {
    scriptHash: string;
    operation: string;
    args: unknown[];
    signers?: NeoDapiSigner[];
    fee?: string;        // extra network fee in GAS string (e.g. "0.1") — NeoLine adds this on top
    description?: string;
  }): Promise<NeoDapiInvokeResult>;
  AddNEP17(params: { scriptHash: string; symbol: string; decimals: number }): Promise<void>;
}

declare global {
  interface Window {
    NEOLine?: { Neo: new () => NeoDapi };
    NEOLineN3?: { Init: new () => NeoDapi; Neo?: new () => NeoDapi };
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

// RPC URL derived from the wallet's selected network after connect().
// Empty until a wallet connects — all RPC calls require a connected wallet.
let _activeRpcUrl: string = "";

/** Well-known public RPC nodes for standard Neo N3 networks. */
const NETWORK_RPC_MAP: Record<string, string> = {
  N3MainNet: "https://mainnet1.neo.coz.io:443",
  N3TestNet: "https://testnet1.neo.coz.io:443",
};

/**
 * Returns the RPC URL that matches the wallet's currently selected network.
 * This is the URL that neo-rpc-client should use for all chain reads,
 * ensuring our app is always talking to the same node as the wallet.
 */
export function getActiveRpcUrl(): string {
  return _activeRpcUrl;
}

function getDapi(type: WalletType): NeoDapi {
  switch (type) {
    case "NeoLine": {
      // NeoLine N3 uses `.Init`; legacy NeoLine uses `.Neo`
      const Ctor = window.NEOLineN3?.Init ?? window.NEOLineN3?.Neo ?? window.NEOLine?.Neo;
      console.log("[dapi] NeoLine getDapi — NEOLineN3:", window.NEOLineN3, "Ctor:", Ctor);
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
  console.log("[dapi] connect called — type:", type);
  const dapi = getDapi(type);
  console.log("[dapi] dapi instance:", dapi);
  const account = await dapi.getAccount();
  console.log("[dapi] getAccount result:", account);

  // Derive the RPC URL from the wallet's currently selected network so our
  // chain reads always hit the same node as NeoLine/OneGate/Neon.
  try {
    const { defaultNetwork } = await dapi.getNetworks();
    const known = NETWORK_RPC_MAP[defaultNetwork];
    if (known) {
      _activeRpcUrl = known;
    } else {
      // Private / custom network — the dAPI does not expose the node URL.
      // Fall back to NEXT_PUBLIC_NEO_RPC_URL if the operator has configured one.
      // Without it, direct RPC reads (balance fallback, tx polling, contract checks)
      // won't work, but wallet operations (sign, send) still go through the extension.
      _activeRpcUrl = PRIVATE_NET_RPC_URL;
    }
    console.log("[dapi] network:", defaultNetwork, "→ RPC:", _activeRpcUrl);
  } catch (err) {
    console.warn("[dapi] getNetworks failed — keeping current RPC:", _activeRpcUrl, err);
  }

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
  _activeRpcUrl = "";
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

  // Try dAPI getBalance first; fall back to direct RPC on any error.
  // NeoExpress's getnep17balances throws "Invalid StackItemType" — NeoLine
  // wraps this as an RPC_ERROR exception rather than returning empty results.
  let balanceList: NeoDapiBalance[] = [];
  try {
    console.log("[dapi] getBalances — address:", address);
    const results = await _dapi.getBalance({ params: [{ address }] });
    console.log("[dapi] getBalance raw result:", results);

    if (Array.isArray(results)) {
      balanceList = (results[0] as { address: string; balances: NeoDapiBalance[] } | undefined)?.balances ?? [];
    } else {
      balanceList = (results as Record<string, NeoDapiBalance[]>)[address] ?? [];
    }
    console.log("[dapi] parsed balanceList:", balanceList);
  } catch (err) {
    console.warn("[dapi] getBalance threw — falling back to direct RPC:", err);
  }

  // Fallback: if dAPI returned no balances or threw (NeoExpress getnep17balances bug),
  // query GAS directly via RPC so the forge fee check always works.
  if (balanceList.length === 0) {
    console.log("[dapi] falling back to direct RPC for GAS balance");
    const gasAmount = await getTokenBalance(GAS_CONTRACT_HASH, address);
    console.log("[dapi] RPC GAS balance:", gasAmount.toString());
    return gasAmount > 0n
      ? [{ contractHash: GAS_CONTRACT_HASH, symbol: "GAS", amount: gasAmount, decimals: 8, displayAmount: formatBalance(gasAmount, 8) }]
      : [];
  }

  return balanceList.map((b) => {
    // NeoLine returns amounts in token display units (e.g. "10000000" = 10M GAS),
    // NOT in raw datoshi. Convert to datoshi by multiplying back by 10^decimals.
    const decimals = 8;
    const amount = parseTokenUnits(b.amount, decimals);
    // Normalize contract hash — NeoLine may return it without the 0x prefix.
    const contractHash = b.contract.startsWith("0x") ? b.contract : `0x${b.contract}`;
    return {
      contractHash,
      symbol: b.symbol,
      amount,
      decimals,
      displayAmount: formatBalance(amount, decimals),
    };
  });
}

/**
 * Converts a token-unit amount string (as returned by NeoLine getBalance)
 * into raw datoshi bigint. Handles both integer ("10000000") and decimal
 * ("10000000.12345678") strings safely without floating-point loss.
 */
function parseTokenUnits(amountStr: string, decimals: number): bigint {
  const [whole, frac = ""] = amountStr.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * BigInt(10 ** decimals) + BigInt(fracPadded || "0");
}

function formatBalance(raw: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  const whole = raw / factor;
  const frac = raw % factor;
  const fracStr = frac.toString().padStart(decimals, "0");
  // Add thousand separators to the whole part
  const wholeFormatted = whole.toLocaleString("en-US");
  return `${wholeFormatted}.${fracStr}`;
}

// ---------------------------------------------------------------------------
// Address utilities
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Converts a Neo N3 Base58Check address to the 0x-prefixed little-endian
 * script hash that NeoLine's dAPI expects in `signers[].account`.
 */
function addressToScriptHash(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return address;
  let n = 0n;
  for (const ch of address) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  for (let i = 0; i < 25; i++) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const hashBytes = bytes.slice(1, 21).reverse();
  return "0x" + hashBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
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

  console.log("[dapi] invokeForge — walletType:", _walletType, "address:", _connectedAddress);
  console.log("[dapi] invokeForge — factoryHash:", factoryHash, "feeAmount:", feeAmount.toString());
  console.log("[dapi] invokeForge — params:", params);

  // NeoLine requires Hash160 args to be script hash (0x hex), not N3 addresses.
  const fromHash = addressToScriptHash(_connectedAddress!);

  const invokeArgs = {
    scriptHash: "0xd2a4cff31913016155e38e474a2c06d08be276cf", // GAS hash
    operation: "transfer",
    args: [
      { type: "Hash160", value: fromHash },
      { type: "Hash160", value: factoryHash },
      { type: "Integer", value: feeAmount.toString() },
      {
        type: "Array",
        value: [
          { type: "String", value: params.name },
          { type: "String", value: params.symbol },
          { type: "Integer", value: params.supply.toString() },
          { type: "Integer", value: params.decimals.toString() },
          { type: "String", value: params.mode },
          { type: "String", value: params.imageUrl ?? "" },
        ],
      },
    ],
    signers: [{ account: fromHash, scopes: "CalledByEntry" as const }],
    description: `Forge token: ${params.name} (${params.symbol})`,
  };

  console.log("[dapi] invokeForge — dapi.invoke args:", JSON.stringify(invokeArgs));

  try {
    const result = await _dapi.invoke(invokeArgs);
    console.log("[dapi] invokeForge — result:", result);
    return result.txid;
  } catch (err) {
    console.error("[dapi] invokeForge — dapi.invoke threw:", err);
    if (typeof err === "object" && err !== null) {
      try {
        console.error("[dapi] invokeForge — error as JSON:", JSON.stringify(err));
      } catch {
        console.error("[dapi] invokeForge — error keys:", Object.keys(err as object));
      }
    }
    if (isWalletRejection(err)) {
      console.log("[dapi] invokeForge — detected as wallet rejection");
      throw new WalletRejectedError();
    }
    throw err;
  }
}

/**
 * Calls setNefAndManifest on the TokenFactory to initialize it with the
 * TokenTemplate contract files. Must be called once after deployFactory().
 * Throws WalletRejectedError if the user cancels.
 * Returns the submitted transaction hash (txid).
 */
export async function initializeFactory(factoryHash: string): Promise<string> {
  if (!_dapi) throw new WalletNotConnectedError();

  const [nefRes, manifestRes] = await Promise.all([
    fetch("/contracts/TokenTemplate.nef"),
    fetch("/contracts/TokenTemplate.manifest.json"),
  ]);
  if (!nefRes.ok || !manifestRes.ok) {
    throw new Error("Failed to fetch TokenTemplate contract files");
  }

  const nefBytes = new Uint8Array(await nefRes.arrayBuffer());
  const manifestText = await manifestRes.text();

  let binary = "";
  nefBytes.forEach((b) => (binary += String.fromCharCode(b)));
  const nefBase64 = btoa(binary);

  console.log("[dapi] initializeFactory — factory:", factoryHash, "nef bytes:", nefBytes.length);

  try {
    const result = await _dapi.invoke({
      scriptHash: factoryHash,
      operation: "setNefAndManifest",
      args: [
        { type: "ByteArray", value: nefBase64 },
        { type: "String", value: manifestText },
      ],
      signers: [{ account: addressToScriptHash(_connectedAddress!), scopes: "CalledByEntry" as const }],
      description: "Initialize TokenFactory with TokenTemplate contract",
    });
    console.log("[dapi] initializeFactory — result:", result);
    return result.txid;
  } catch (err) {
    console.error("[dapi] initializeFactory — failed:", err);
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

/** ContractManagement hash — same on all Neo N3 networks. */
const CONTRACT_MANAGEMENT_HASH = "0xfffdc93764dbaddd97c48f252a53ea4643faa3fd";

/**
 * Deploys the TokenFactory contract via ContractManagement.deploy.
 * Fetches the NEF and manifest from /contracts/ (served from public/).
 * Passes null as the data arg — _deploy() will use Runtime.Transaction.Sender as owner.
 * Throws WalletRejectedError if the user cancels.
 * Returns the submitted transaction hash (txid).
 */
export async function deployFactory(): Promise<string> {
  if (!_dapi) throw new WalletNotConnectedError();

  const [nefRes, manifestRes] = await Promise.all([
    fetch("/contracts/TokenFactory.nef"),
    fetch("/contracts/TokenFactory.manifest.json"),
  ]);
  if (!nefRes.ok || !manifestRes.ok) {
    throw new Error("Failed to fetch TokenFactory contract files");
  }

  const nefBytes = new Uint8Array(await nefRes.arrayBuffer());
  const manifestText = await manifestRes.text();

  // Encode NEF as base64 — NeoLine N3 expects ByteArray as base64, not hex
  let binary = "";
  nefBytes.forEach((b) => (binary += String.fromCharCode(b)));
  const nefBase64 = btoa(binary);

  console.log("[dapi] deployFactory — nef bytes:", nefBytes.length, "manifest chars:", manifestText.length);

  try {
    const result = await _dapi.invoke({
      scriptHash: CONTRACT_MANAGEMENT_HASH,
      operation: "deploy",
      args: [
        { type: "ByteArray", value: nefBase64 },
        { type: "String", value: manifestText },
        { type: "Any", value: null },
      ],
      // NeoLine signers.account must be the script hash (0x hex), not the address
      signers: [{ account: addressToScriptHash(_connectedAddress!), scopes: "CalledByEntry" }],
      // The deploy script embeds the full NEF+manifest (~3500 bytes).
      // NeoLine calculates network fee automatically — we add a small buffer (0.02 GAS)
      // in case the calculated minimum (≈0.065 GAS) is slightly off.
      fee: "0.02",
      description: "Deploy TokenFactory contract — you will be set as owner",
    });
    return result.txid;
  } catch (err) {
    console.error("[dapi] deployFactory invoke failed:", JSON.stringify(err));
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
