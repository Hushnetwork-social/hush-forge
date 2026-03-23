/**
 * Neo N3 JSON-RPC client for the Forge module.
 * All blockchain reads go through this single module.
 * RPC URL is resolved dynamically from the connected wallet's network via getActiveRpcUrl().
 */

import * as Neon from "@cityofzion/neon-js";
import { getActiveRpcUrl } from "./neo-dapi-adapter";
import type {
  ApplicationLog,
  InvokeResult,
  RpcSigner,
  RpcStackItem,
} from "./types";
import { NeoRpcError } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Address utilities
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Converts a Neo N3 address (e.g. "NRyRNU...") to the little-endian hex script
 * hash format required by the JSON-RPC `invokefunction` args (e.g. "0xabcd...").
 * If the input already looks like a hex hash it is returned as-is.
 */
export function addressToHash160(addressOrHash: string): string {
  // Already a hex script hash (0x + 40 hex chars)
  if (/^0x[0-9a-fA-F]{40}$/.test(addressOrHash)) return addressOrHash;

  // Base58Check decode
  let n = 0n;
  for (const ch of addressOrHash) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  // Pad to 25 bytes: 1 version + 20 hash + 4 checksum
  const bytes: number[] = [];
  for (let i = 0; i < 25; i++) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  // bytes[1..20] = script hash big-endian → reverse to little-endian for RPC
  const hashBytes = bytes.slice(1, 21).reverse();
  return "0x" + hashBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Converts a little-endian script hash into a Neo N3 address for display and
 * RPC methods that require the base58 address form.
 * If the input is already an address it is returned as-is.
 */
export function hash160ToAddress(hashOrAddress: string): string {
  if (/^N/.test(hashOrAddress)) return hashOrAddress;
  const normalized = hashOrAddress.startsWith("0x")
    ? hashOrAddress.slice(2)
    : hashOrAddress;

  if (!/^[0-9a-fA-F]{40}$/.test(normalized)) {
    throw new Error("Invalid UInt160 hash");
  }

  return Neon.wallet.getAddressFromScriptHash(normalized);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface Nep17BalanceEntry {
  assethash: string;
  amount: string;
  lastupdatedblock: number;
}

function hexToBase64(value: string): string {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Script must be a hex string");
  }
  let binary = "";
  for (let index = 0; index < normalized.length; index += 2) {
    binary += String.fromCharCode(parseInt(normalized.slice(index, index + 2), 16));
  }
  return btoa(binary);
}

export interface Nep17BalancesResult {
  address: string;
  balance: Nep17BalanceEntry[];
}

async function rpcCall<T>(
  method: string,
  params: unknown[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const rpcUrl = getActiveRpcUrl();
  if (!rpcUrl) {
    throw new NeoRpcError("No wallet connected — connect your wallet first to establish the network RPC endpoint");
  }
  try {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new NeoRpcError(
        `Neo RPC unreachable: HTTP ${resp.status} from ${rpcUrl}`
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
      throw new NeoRpcError(`Neo RPC unreachable: timeout after ${timeoutMs}ms (${rpcUrl})`);
    }
    throw new NeoRpcError(`Neo RPC unreachable: ${String(err)} (${rpcUrl})`);
  } finally {
    clearTimeout(timer);
  }
}

function toAbsoluteRpcUrl(rpcUrl: string): string {
  if (/^https?:\/\//i.test(rpcUrl)) return rpcUrl;
  if (typeof window !== "undefined") {
    return new URL(rpcUrl, window.location.origin).toString();
  }
  throw new NeoRpcError(`Neo RPC error: Please provide an url that starts with http:// or https://`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns current block count (blockchain height). */
export async function getBlockCount(): Promise<number> {
  return rpcCall<number>("getblockcount", []);
}

/**
 * Returns true if a contract with the given hash is deployed on the current network.
 * Uses getcontractstate — returns false on any RPC error (including "unknown contract").
 */
export async function isContractDeployed(contractHash: string): Promise<boolean> {
  if (!contractHash || contractHash === "0x") return false;
  try {
    await rpcCall<unknown>("getcontractstate", [contractHash]);
    return true;
  } catch {
    return false;
  }
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
 * Dry-runs an arbitrary script against the current RPC node.
 * Used for off-chain fee estimation before a wallet signature is requested.
 */
export async function invokeScript(
  script: string,
  signers: RpcSigner[] = []
): Promise<InvokeResult> {
  const params: unknown[] = [hexToBase64(script)];
  if (signers.length > 0) {
    params.push(signers);
  }

  const result = await rpcCall<InvokeResult>("invokescript", params);

  if (result.state === "FAULT") {
    throw new NeoRpcError(
      `Contract invocation FAULT: ${result.exception ?? "unknown reason"}`
    );
  }

  return result;
}

/**
 * Estimates the network fee for an unsigned transaction.
 * Accepts either a neon-js Transaction object or a pre-serialized hex string.
 */
export async function calculateNetworkFee(
  unsignedTransaction: string | InstanceType<typeof Neon.tx.Transaction>
): Promise<bigint> {
  if (typeof unsignedTransaction !== "string") {
    const rpcUrl = getActiveRpcUrl();
    if (!rpcUrl) {
      throw new NeoRpcError(
        "No wallet connected — connect your wallet first to establish the network RPC endpoint"
      );
    }
    try {
      const client = new Neon.rpc.NeoServerRpcClient(toAbsoluteRpcUrl(rpcUrl));
      const result = await client.calculateNetworkFee(unsignedTransaction);
      return BigInt(result);
    } catch (err) {
      throw new NeoRpcError(`Neo RPC error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const result = await rpcCall<string | number>("calculatenetworkfee", [
    hexToBase64(unsignedTransaction),
  ]);

  return BigInt(result);
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
 * Returns the raw mempool transaction hashes.
 * If the node does not support or temporarily fails this call, returns [].
 */
export async function getRawMemPool(): Promise<string[]> {
  try {
    const hashes = await rpcCall<string[]>("getrawmempool", []);
    return Array.isArray(hashes) ? hashes : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// NEP-17 transfer history
// ---------------------------------------------------------------------------

export interface Nep17Transfer {
  timestamp: number;
  asset_hash: string;
  transfer_address: string | null;
  amount: string;
  block_index: number;
  transfer_notify_index: number;
  tx_hash: string;
}

export interface Nep17TransferResult {
  sent: Nep17Transfer[];
  received: Nep17Transfer[];
  address: string;
}

/**
 * Fetches the full NEP-17 transfer history for a wallet address.
 * Requires the RpcNep17Tracker (or equivalent) plugin on the Neo node.
 * Throws NeoRpcError if the method is not available on this network.
 */
export async function getNep17Transfers(
  address: string
): Promise<Nep17TransferResult> {
  return rpcCall<Nep17TransferResult>("getnep17transfers", [address]);
}

/**
 * Fetches NEP-17 balances for any address directly from the RPC node.
 * This is used for TokenFactory claim discovery where no wallet dAPI context exists.
 */
export async function getNep17Balances(
  address: string
): Promise<Nep17BalancesResult> {
  return rpcCall<Nep17BalancesResult>("getnep17balances", [address]);
}

// ---------------------------------------------------------------------------
// Chain-wide token enumeration via findstorage
// ---------------------------------------------------------------------------

interface FindStorageResult {
  id: number;
  next: number;
  truncated: boolean;
  results: Array<{ key: string; value: string }>;
}

/** Decodes a base64-encoded 20-byte UInt160 (LE) into a 0x-prefixed hash string. */
function decodeUInt160Value(base64: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.length !== 20) return null;
    const hex = [...bytes]
      .reverse()
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `0x${hex}`;
  } catch {
    return null;
  }
}

/**
 * Returns all token contract hashes registered in the factory's global token
 * list. Uses Neo N3's `findstorage` RPC on the factory's Prefix_GlobalTokenList
 * (byte 0x02) — no indexer or contract change required.
 *
 * Storage format: key=[0x02][index_le_bytes] → value=UInt160(20 bytes, LE)
 */
export async function getAllFactoryTokenHashes(
  factoryHash: string
): Promise<string[]> {
  if (!factoryHash) return [];

  // base64([0x02]) — factory's Prefix_GlobalTokenList constant
  const GLOBAL_LIST_PREFIX = "Ag==";
  const hashes: string[] = [];
  let start = 0;

  try {
    while (true) {
      const page = await rpcCall<FindStorageResult>("findstorage", [
        factoryHash,
        GLOBAL_LIST_PREFIX,
        start,
      ]);

      for (const item of page.results) {
        const hash = decodeUInt160Value(item.value);
        if (hash) hashes.push(hash);
      }

      if (!page.truncated) break;
      start = page.next;
    }
  } catch (err) {
    console.warn("[rpc] getAllFactoryTokenHashes (findstorage) failed:", String(err));
  }

  return hashes;
}


// ---------------------------------------------------------------------------
// Token balance
// ---------------------------------------------------------------------------

/**
 * Reads the NEP-17 balance of an address for a specific token contract.
 * Returns 0n if the address holds no balance for that token.
 */
export async function getTokenBalance(
  contractHash: string,
  address: string
): Promise<bigint> {
  try {
    const hash = addressToHash160(address);
    const result = await invokeFunction(contractHash, "balanceOf", [
      { type: "Hash160", value: hash },
    ]);
    const item = result.stack[0];
    if (!item) return 0n;
    return BigInt(item.value as string | number);
  } catch {
    return 0n;
  }
}
