/**
 * ForgeService — Core business logic for token creation.
 *
 * Responsible for: fee fetch, GAS balance check, TX submission, and the
 * confirmation polling loop. Does NOT touch UI state — stores and hooks
 * orchestrate these calls and update state accordingly.
 */

import {
  FACTORY_CONTRACT_HASH,
  GAS_CONTRACT_HASH,
  TX_POLLING_INTERVAL_MS,
  TX_POLLING_TIMEOUT_MS,
} from "./forge-config";
import { invokeForge as dapiInvokeForge } from "./neo-dapi-adapter";
import { getApplicationLog, getTokenBalance, invokeFunction } from "./neo-rpc-client";
import type {
  ApplicationLog,
  ForgeParams,
  RpcStackItem,
  TokenCreatedEvent,
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
    const result = await invokeFunction(
      FACTORY_CONTRACT_HASH,
      "GetMinFee",
      []
    );
    const item = result.stack[0];
    if (!item) return formatFee(DEFAULT_FEE_DATOSHI);
    const datoshi = BigInt(item.value as string | number);
    return formatFee(datoshi);
  } catch {
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
  return dapiInvokeForge(FACTORY_CONTRACT_HASH, feeAmount, params);
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
  onProgress?: (status: TxStatus) => void
): Promise<TokenCreatedEvent> {
  const deadline = Date.now() + TX_POLLING_TIMEOUT_MS;

  return new Promise<TokenCreatedEvent>((resolve, reject) => {
    async function check() {
      try {
        const log = await getApplicationLog(txHash);

        if (log === null) {
          // TX not yet indexed — still pending
          onProgress?.("confirming");
          if (Date.now() >= deadline) {
            reject(new TxTimeoutError(txHash));
            return;
          }
          setTimeout(check, TX_POLLING_INTERVAL_MS);
          return;
        }

        const exec = log.executions.find((e) => e.trigger === "Application");
        if (exec?.vmstate === "FAULT") {
          reject(new TxFaultedError(txHash));
          return;
        }

        onProgress?.("confirmed");
        resolve(parseTokenCreatedEvent(log));
      } catch {
        // RPC error during polling — treat as still pending unless timed out
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
