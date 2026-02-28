/**
 * ForgeService — Core business logic for token creation.
 *
 * Responsible for: fee fetch, GAS balance check, TX submission, and the
 * confirmation polling loop. Does NOT touch UI state — stores and hooks
 * orchestrate these calls and update state accordingly.
 */

import {
  getRuntimeFactoryHash,
  GAS_CONTRACT_HASH,
  TX_POLLING_INTERVAL_MS,
  TX_POLLING_TIMEOUT_MS,
} from "./forge-config";
import { invokeForge as dapiInvokeForge } from "./neo-dapi-adapter";
import {
  getAllFactoryTokenHashes,
  getApplicationLog,
  getRawMemPool,
  getTokenBalance,
  invokeFunction,
} from "./neo-rpc-client";
import type {
  ApplicationLog,
  ForgeParams,
  RpcStackItem,
  TxStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Thrown when a submitted transaction is included in a block but the VM faulted. */
export class TxFaultedError extends Error {
  constructor(public readonly txHash: string) {
    super(`Transaction faulted: ${txHash}`);
    this.name = "TxFaultedError";
  }
}

/** Thrown when polling for a transaction exceeds TX_POLLING_TIMEOUT_MS. */
export class TxTimeoutError extends Error {
  constructor(public readonly txHash: string) {
    super(`Transaction confirmation timeout: ${txHash}`);
    this.name = "TxTimeoutError";
  }
}

export interface TxConfirmationResult {
  contractHash: string | null;
}

// ---------------------------------------------------------------------------
// Fee
// ---------------------------------------------------------------------------

const DEFAULT_FEE_DATOSHI = 1_500_000_000n; // 15 GAS fallback

export interface CreationFee {
  datoshi: bigint;
  displayGas: string;
}

/**
 * Fetches the current minimum creation fee from the factory contract.
 * Falls back to 15 GAS (1,500,000,000 datoshi) if the RPC call fails,
 * so the fee display is never broken for the user.
 */
export async function fetchCreationFee(): Promise<CreationFee> {
  try {
    const factoryHash = getRuntimeFactoryHash();
    console.log("[forge] fetchCreationFee — factory hash:", factoryHash || "(empty — not configured!)");
    const result = await invokeFunction(factoryHash, "getMinFee", []);
    console.log("[forge] GetMinFee raw result:", result);
    const item = result.stack[0];
    if (!item) {
      console.warn("[forge] GetMinFee returned empty stack — using fallback fee");
      return formatFee(DEFAULT_FEE_DATOSHI);
    }
    const datoshi = BigInt(item.value as string | number);
    console.log("[forge] creation fee:", datoshi.toString(), "datoshi");
    return formatFee(datoshi);
  } catch (err) {
    console.warn("[forge] fetchCreationFee failed — using fallback 15 GAS:", err);
    return formatFee(DEFAULT_FEE_DATOSHI);
  }
}

function formatFee(datoshi: bigint): CreationFee {
  const whole = datoshi / 100_000_000n;
  return { datoshi, displayGas: whole.toString() };
}

// ---------------------------------------------------------------------------
// GAS balance check
// ---------------------------------------------------------------------------

export interface GasBalanceCheck {
  sufficient: boolean;
  actual: bigint;
  required: bigint; // fee + 10% buffer
}

export interface SymbolAvailability {
  available: boolean;
  reason?: string;
}

function parseFactorySymbolFromStack(stack: RpcStackItem[]): string | null {
  const top = stack[0];
  if (!top || top.type !== "Array") return null;
  const values = top.value as RpcStackItem[];
  const raw = values?.[0];
  if (!raw || raw.type !== "ByteString") return null;
  try {
    return atob(raw.value as string);
  } catch {
    return null;
  }
}

/**
 * Checks whether a symbol is already used by known network tokens:
 * - native NEO/GAS (always blocked)
 * - all tokens currently registered in TokenFactory global list
 */
export async function checkSymbolAvailability(
  symbol: string
): Promise<SymbolAvailability> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return { available: true };

  if (normalized === "NEO" || normalized === "GAS") {
    return {
      available: false,
      reason: `Symbol ${normalized} is reserved by a native Neo token.`,
    };
  }

  const factoryHash = getRuntimeFactoryHash();
  if (!factoryHash) return { available: true };

  const hashes = await getAllFactoryTokenHashes(factoryHash);
  if (hashes.length === 0) return { available: true };

  const checks = await Promise.all(
    hashes.map(async (contractHash) => {
      try {
        const result = await invokeFunction(factoryHash, "getToken", [
          { type: "Hash160", value: contractHash },
        ]);
        const existing = parseFactorySymbolFromStack(result.stack);
        return { contractHash, existing };
      } catch {
        return { contractHash, existing: null as string | null };
      }
    })
  );

  const match = checks.find(
    (c) => c.existing && c.existing.toUpperCase() === normalized
  );
  if (match) {
    return {
      available: false,
      reason: `Symbol ${normalized} is already in use by ${match.contractHash}.`,
    };
  }

  return { available: true };
}

/**
 * Checks whether the given address has enough GAS for the creation fee.
 * Adds a 10% system fee buffer to the required amount.
 */
export async function checkGasBalance(
  address: string,
  feeDatoshi: bigint
): Promise<GasBalanceCheck> {
  const actual = await getTokenBalance(GAS_CONTRACT_HASH, address);
  const required = feeDatoshi + feeDatoshi / 10n;
  return { sufficient: actual >= required, actual, required };
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/**
 * Submits a token creation transaction via the connected wallet.
 * Returns the transaction hash.
 * Throws WalletRejectedError if the user cancels.
 */
export async function submitForge(
  params: ForgeParams,
  feeAmount: bigint
): Promise<string> {
  const factoryHash = getRuntimeFactoryHash();
  console.log("[forge] submitForge — factory:", factoryHash || "(empty — not configured!)", "fee:", feeAmount.toString(), "params:", params);
  if (!factoryHash) {
    throw new Error("Factory contract hash is not configured. Deploy the factory first or set NEXT_PUBLIC_FACTORY_CONTRACT_HASH.");
  }
  return dapiInvokeForge(factoryHash, feeAmount, params);
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/**
 * Polls getApplicationLog until the TokenCreated event is found.
 * Uses recursive setTimeout (not setInterval) to avoid overlapping calls.
 *
 * @throws TxFaultedError if the TX is included but the VM faulted
 * @throws TxTimeoutError if polling exceeds TX_POLLING_TIMEOUT_MS
 */
export function pollForConfirmation(
  txHash: string,
  onProgress?: (status: TxStatus) => void,
  options?: { timeoutMs?: number }
): Promise<TxConfirmationResult> {
  const timeoutMs = options?.timeoutMs ?? TX_POLLING_TIMEOUT_MS;
  const hasDeadline = timeoutMs > 0;
  const deadline = hasDeadline ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY;
  console.log(
    "[forge] pollForConfirmation started — txHash:",
    txHash,
    "timeout:",
    hasDeadline ? `${timeoutMs} ms` : "none"
  );

  return new Promise<TxConfirmationResult>((resolve, reject) => {
    async function check() {
      console.log("[forge] polling getApplicationLog for:", txHash);
      try {
        const log = await getApplicationLog(txHash);

        if (log === null) {
          const mempool = (await getRawMemPool()) ?? [];
          const inMempool = mempool.some(
            (hash) => hash.toLowerCase() === txHash.toLowerCase()
          );
          // TX not yet indexed — track whether it is in mempool or still propagating.
          console.log(
            "[forge] TX not yet indexed — inMempool:",
            inMempool,
            "retrying in",
            TX_POLLING_INTERVAL_MS,
            "ms"
          );
          onProgress?.(inMempool ? "confirming" : "pending");
          if (Date.now() >= deadline) {
            console.error("[forge] polling timeout for:", txHash);
            reject(new TxTimeoutError(txHash));
            return;
          }
          setTimeout(check, TX_POLLING_INTERVAL_MS);
          return;
        }

        console.log("[forge] getApplicationLog result:", JSON.stringify(log, null, 2));
        const exec = log.executions.find((e) => e.trigger === "Application");
        if (exec?.vmstate === "FAULT") {
          console.error("[forge] TX faulted — exception:", exec.exception);
          reject(new TxFaultedError(txHash));
          return;
        }

        console.log("[forge] TX confirmed! Finalizing confirmation state...");
        onProgress?.("confirmed");
        let contractHash: string | null = null;
        try {
          contractHash = parseTokenCreatedEvent(log).contractHash;
        } catch {
          // Non-forge operations (mint/update/lock/etc.) don't emit TokenCreated.
          // Confirmation is still valid when vmstate = HALT.
        }
        resolve({ contractHash });
      } catch (err) {
        // RPC error during polling — treat as still pending unless timed out
        console.warn("[forge] polling RPC error:", err);
        onProgress?.("pending");
        if (Date.now() >= deadline) {
          reject(new TxTimeoutError(txHash));
          return;
        }
        setTimeout(check, TX_POLLING_INTERVAL_MS);
      }
    }

    check();
  });
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

/** Decodes a base64-encoded little-endian UInt160 to a 0x-prefixed hex string. */
function decodeHash(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const hex = [...bytes]
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/** Decodes a base64-encoded UTF-8 string. */
function decodeStr(base64: string): string {
  return atob(base64);
}

function stackItem(values: RpcStackItem[], i: number): RpcStackItem {
  return values[i] as RpcStackItem;
}

/**
 * Extracts a TokenCreatedEvent from an ApplicationLog.
 * Expects the notification state values to be ByteString (base64) + Integer.
 * @throws Error if no TokenCreated notification is found.
 */
export function parseTokenCreatedEvent(log: ApplicationLog): TokenCreatedEvent {
  for (const exec of log.executions) {
    if (exec.trigger !== "Application") continue;
    for (const notif of exec.notifications) {
      if (notif.eventname !== "TokenCreated") continue;

      const v = notif.state.value;
      return {
        contractHash: decodeHash(stackItem(v, 0).value as string),
        creator: decodeHash(stackItem(v, 1).value as string),
        symbol: decodeStr(stackItem(v, 2).value as string),
        supply: BigInt(stackItem(v, 3).value as string),
        mode: decodeStr(stackItem(v, 4).value as string) as
          | "community"
          | "premium",
        tier: Number(stackItem(v, 5).value as string),
      };
    }
  }
  throw new Error("TokenCreated event not found in ApplicationLog");
}
