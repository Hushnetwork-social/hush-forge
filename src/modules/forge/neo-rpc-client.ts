/**
 * Neo N3 JSON-RPC client for the Forge module.
 * All blockchain reads go through this single module.
 * Uses fetch() with the absolute NEXT_PUBLIC_NEO_RPC_URL — no buildApiUrl() needed.
 */

import { NEO_RPC_URL } from "./forge-config";
import type { ApplicationLog, InvokeResult, RpcStackItem } from "./types";
import { NeoRpcError } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(
  method: string,
  params: unknown[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(NEO_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new NeoRpcError(
        `Neo RPC unreachable: HTTP ${resp.status} from ${NEO_RPC_URL}`
      );
    }

    const data: JsonRpcResponse<T> = await resp.json();

    if (data.error) {
      throw new NeoRpcError(
        `Neo RPC error: ${data.error.message}`,
        data.error.code
      );
    }

    return data.result as T;
  } catch (err) {
    if (err instanceof NeoRpcError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new NeoRpcError(`Neo RPC unreachable: timeout after ${timeoutMs}ms`);
    }
    throw new NeoRpcError(`Neo RPC unreachable: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns current block count (blockchain height). */
export async function getBlockCount(): Promise<number> {
  return rpcCall<number>("getblockcount", []);
}

/**
 * Calls a read-only (or state-changing) contract method.
 * Throws NeoRpcError if the invocation returns FAULT state.
 */
export async function invokeFunction(
  contractHash: string,
  operation: string,
  params: RpcStackItem[] = []
): Promise<InvokeResult> {
  const result = await rpcCall<InvokeResult>("invokefunction", [
    contractHash,
    operation,
    params,
  ]);

  if (result.state === "FAULT") {
    throw new NeoRpcError(
      `Contract invocation FAULT: ${result.exception ?? "unknown reason"}`
    );
  }

  return result;
}

/**
 * Fetches the application log for a submitted transaction.
 * Returns null if the transaction is not found (not yet indexed or unknown hash).
 */
export async function getApplicationLog(
  txHash: string
): Promise<ApplicationLog | null> {
  try {
    return await rpcCall<ApplicationLog>("getapplicationlog", [txHash]);
  } catch (err) {
    // RPC error code -100 = unknown transaction (not an error condition for polling)
    if (err instanceof NeoRpcError && err.code === -100) return null;
    // "Unknown transaction" message variant
    if (
      err instanceof NeoRpcError &&
      err.message.toLowerCase().includes("unknown transaction")
    )
      return null;
    throw err;
  }
}

/**
 * Reads the NEP-17 balance of an address for a specific token contract.
 * Returns 0n if the address holds no balance for that token.
 */
export async function getTokenBalance(
  contractHash: string,
  address: string
): Promise<bigint> {
  try {
    const result = await invokeFunction(contractHash, "balanceOf", [
      { type: "Hash160", value: address },
    ]);
    const item = result.stack[0];
    if (!item) return 0n;
    return BigInt(item.value as string | number);
  } catch {
    return 0n;
  }
}
