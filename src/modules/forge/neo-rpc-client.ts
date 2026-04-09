/**
 * Neo N3 JSON-RPC client for the Forge module.
 * All blockchain reads go through this single module.
 * RPC URL prefers the connected wallet's network via getActiveRpcUrl().
 * Public read surfaces can fall back to NEXT_PUBLIC_NEO_RPC_URL when no wallet is connected.
 */

import * as Neon from "@cityofzion/neon-js";
import { PRIVATE_NET_RPC_URL } from "./forge-config";
import { getActiveRpcUrl } from "./neo-dapi-adapter";
import type {
  ApplicationLog,
  InvokeResult,
  MarketBuyQuote,
  MarketCurveState,
  MarketGraduationProgress,
  MarketPairStatus,
  MarketQuoteAsset,
  MarketSellQuote,
  RpcSigner,
  RpcStackItem,
} from "./types";
import { NeoRpcError } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const UTF8_DECODER = new TextDecoder();

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
  if (/^0x[0-9a-fA-F]{40}$/.test(addressOrHash)) return addressOrHash;

  let n = 0n;
  for (const ch of addressOrHash) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }

  const bytes: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }

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

function getRpcUrl(): string {
  const activeRpcUrl = getActiveRpcUrl();
  if (activeRpcUrl) return activeRpcUrl;
  if (PRIVATE_NET_RPC_URL) return PRIVATE_NET_RPC_URL;
  throw new NeoRpcError(
    "No Neo RPC endpoint configured. Connect your wallet or set NEXT_PUBLIC_NEO_RPC_URL."
  );
}

function decodeBase64Bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function parseLittleEndianBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;

  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) | BigInt(bytes[index]);
  }
  return result;
}

function parseStackItemBigInt(item: RpcStackItem | undefined, label: string): bigint {
  if (!item) {
    throw new NeoRpcError(`${label} missing`);
  }

  if (item.type === "Integer") {
    try {
      return BigInt(String(item.value));
    } catch {
      throw new NeoRpcError(`${label} is not a valid integer`);
    }
  }

  if (item.type === "ByteString" || item.type === "ByteArray") {
    try {
      return parseLittleEndianBigInt(decodeBase64Bytes(String(item.value)));
    } catch {
      throw new NeoRpcError(`${label} is not a valid byte-encoded integer`);
    }
  }

  if (item.type === "Boolean") {
    return item.value ? 1n : 0n;
  }

  if (item.type === "String") {
    try {
      return BigInt(String(item.value));
    } catch {
      throw new NeoRpcError(`${label} is not a valid numeric string`);
    }
  }

  throw new NeoRpcError(`${label} has unsupported stack type ${item.type}`);
}

function parseStackItemBoolean(item: RpcStackItem | undefined, label: string): boolean {
  if (!item) {
    throw new NeoRpcError(`${label} missing`);
  }

  if (item.type === "Boolean") {
    return Boolean(item.value);
  }

  if (item.type === "Integer" || item.type === "ByteString" || item.type === "ByteArray") {
    return parseStackItemBigInt(item, label) !== 0n;
  }

  if (item.type === "String") {
    const normalized = String(item.value).trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  throw new NeoRpcError(`${label} is not a valid boolean`);
}

function parseStackItemText(item: RpcStackItem | undefined, label: string): string {
  if (!item) {
    throw new NeoRpcError(`${label} missing`);
  }

  if (item.type === "String") {
    return String(item.value);
  }

  if (item.type === "ByteString" || item.type === "ByteArray") {
    try {
      return UTF8_DECODER.decode(decodeBase64Bytes(String(item.value)));
    } catch {
      throw new NeoRpcError(`${label} is not a valid UTF-8 string`);
    }
  }

  if (item.type === "Integer" || item.type === "Boolean") {
    return String(item.value);
  }

  throw new NeoRpcError(`${label} has unsupported text stack type ${item.type}`);
}

function parseStackItemSafeNumber(item: RpcStackItem | undefined, label: string): number {
  const value = parseStackItemBigInt(item, label);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new NeoRpcError(`${label} exceeds JavaScript safe integer range`);
  }
  return parsed;
}

function expectTuple(stack: RpcStackItem[], label: string, length: number): RpcStackItem[] {
  const tuple = stack[0];
  if (!tuple || tuple.type !== "Array" || !Array.isArray(tuple.value)) {
    throw new NeoRpcError(`${label} returned a malformed tuple`);
  }

  const values = tuple.value as RpcStackItem[];
  if (values.length < length) {
    throw new NeoRpcError(`${label} returned ${values.length} values, expected at least ${length}`);
  }

  return values;
}

function normalizeQuoteAsset(value: string, label: string): MarketQuoteAsset {
  const normalized = value.trim().toUpperCase();
  if (normalized === "GAS" || normalized === "NEO") {
    return normalized;
  }
  throw new NeoRpcError(`${label} returned unsupported quote asset: ${value}`);
}

function derivePairStatus(contractStatus: string, graduationReady: boolean): MarketPairStatus {
  if (graduationReady) return "graduation_ready";
  if (contractStatus.trim().length > 0) return "active";
  return "unknown";
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

  const rpcUrl = getRpcUrl();
  try {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new NeoRpcError(`Neo RPC unreachable: HTTP ${resp.status} from ${rpcUrl}`);
    }

    const data: JsonRpcResponse<T> = await resp.json();

    if (data.error) {
      throw new NeoRpcError(`Neo RPC error: ${data.error.message}`, data.error.code);
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
  throw new NeoRpcError("Neo RPC error: Please provide a URL that starts with http:// or https://");
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
 * Uses getcontractstate and returns false on any RPC error.
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
    throw new NeoRpcError(`Contract invocation FAULT: ${result.exception ?? "unknown reason"}`);
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
    throw new NeoRpcError(`Contract invocation FAULT: ${result.exception ?? "unknown reason"}`);
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
    const rpcUrl = getRpcUrl();
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
export async function getApplicationLog(txHash: string): Promise<ApplicationLog | null> {
  try {
    return await rpcCall<ApplicationLog>("getapplicationlog", [txHash]);
  } catch (err) {
    if (err instanceof NeoRpcError && err.code === -100) return null;
    if (
      err instanceof NeoRpcError &&
      err.message.toLowerCase().includes("unknown transaction")
    ) {
      return null;
    }
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
 */
export async function getNep17Transfers(address: string): Promise<Nep17TransferResult> {
  return rpcCall<Nep17TransferResult>("getnep17transfers", [address]);
}

/**
 * Fetches NEP-17 balances for any address directly from the RPC node.
 * This is used for TokenFactory claim discovery where no wallet dAPI context exists.
 */
export async function getNep17Balances(address: string): Promise<Nep17BalancesResult> {
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
    const bytes = decodeBase64Bytes(base64);
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
 * (byte 0x02) with no indexer dependency.
 */
export async function getAllFactoryTokenHashes(factoryHash: string): Promise<string[]> {
  if (!factoryHash) return [];

  const globalListPrefix = "Ag==";
  const hashes: string[] = [];
  let start = 0;

  try {
    while (true) {
      const page = await rpcCall<FindStorageResult>("findstorage", [
        factoryHash,
        globalListPrefix,
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
// Bonding-curve market reads
// ---------------------------------------------------------------------------

export function mapCurveTuple(tokenHash: string, stack: RpcStackItem[]): MarketCurveState {
  const tuple = expectTuple(stack, "GetCurve", 14);
  const contractStatus = parseStackItemText(tuple[0], "GetCurve[0]");
  const graduationReady = parseStackItemBoolean(tuple[7], "GetCurve[7]");

  return {
    tokenHash,
    contractStatus,
    status: derivePairStatus(contractStatus, graduationReady),
    quoteAsset: normalizeQuoteAsset(parseStackItemText(tuple[1], "GetCurve[1]"), "GetCurve[1]"),
    virtualQuote: parseStackItemBigInt(tuple[2], "GetCurve[2]"),
    realQuote: parseStackItemBigInt(tuple[3], "GetCurve[3]"),
    currentCurveInventory: parseStackItemBigInt(tuple[4], "GetCurve[4]"),
    invariantK: parseStackItemBigInt(tuple[5], "GetCurve[5]"),
    graduationThreshold: parseStackItemBigInt(tuple[6], "GetCurve[6]"),
    graduationReady,
    currentPrice: parseStackItemBigInt(tuple[8], "GetCurve[8]"),
    totalTrades: parseStackItemBigInt(tuple[9], "GetCurve[9]"),
    createdAt: parseStackItemSafeNumber(tuple[10], "GetCurve[10]"),
    curveInventory: parseStackItemBigInt(tuple[11], "GetCurve[11]"),
    retainedInventory: parseStackItemBigInt(tuple[12], "GetCurve[12]"),
    totalSupply: parseStackItemBigInt(tuple[13], "GetCurve[13]"),
  };
}

export function mapBuyQuoteTuple(tokenHash: string, stack: RpcStackItem[]): MarketBuyQuote {
  const tuple = expectTuple(stack, "GetBuyQuote", 10);

  return {
    tokenHash,
    grossQuoteIn: parseStackItemBigInt(tuple[0], "GetBuyQuote[0]"),
    quoteConsumed: parseStackItemBigInt(tuple[1], "GetBuyQuote[1]"),
    quoteRefund: parseStackItemBigInt(tuple[2], "GetBuyQuote[2]"),
    grossTokenOut: parseStackItemBigInt(tuple[3], "GetBuyQuote[3]"),
    burnAmount: parseStackItemBigInt(tuple[4], "GetBuyQuote[4]"),
    netTokenOut: parseStackItemBigInt(tuple[5], "GetBuyQuote[5]"),
    platformFee: parseStackItemBigInt(tuple[6], "GetBuyQuote[6]"),
    creatorFee: parseStackItemBigInt(tuple[7], "GetBuyQuote[7]"),
    nextPrice: parseStackItemBigInt(tuple[8], "GetBuyQuote[8]"),
    capped: parseStackItemBoolean(tuple[9], "GetBuyQuote[9]"),
  };
}

export function mapSellQuoteTuple(tokenHash: string, stack: RpcStackItem[]): MarketSellQuote {
  const tuple = expectTuple(stack, "GetSellQuote", 9);

  return {
    tokenHash,
    grossTokenIn: parseStackItemBigInt(tuple[0], "GetSellQuote[0]"),
    burnAmount: parseStackItemBigInt(tuple[1], "GetSellQuote[1]"),
    netTokenIn: parseStackItemBigInt(tuple[2], "GetSellQuote[2]"),
    grossQuoteOut: parseStackItemBigInt(tuple[3], "GetSellQuote[3]"),
    netQuoteOut: parseStackItemBigInt(tuple[4], "GetSellQuote[4]"),
    platformFee: parseStackItemBigInt(tuple[5], "GetSellQuote[5]"),
    creatorFee: parseStackItemBigInt(tuple[6], "GetSellQuote[6]"),
    nextPrice: parseStackItemBigInt(tuple[7], "GetSellQuote[7]"),
    liquidityOkay: parseStackItemBoolean(tuple[8], "GetSellQuote[8]"),
  };
}

export function mapGraduationProgressTuple(
  tokenHash: string,
  stack: RpcStackItem[]
): MarketGraduationProgress {
  const tuple = expectTuple(stack, "GetGraduationProgress", 4);

  return {
    tokenHash,
    realQuote: parseStackItemBigInt(tuple[0], "GetGraduationProgress[0]"),
    graduationThreshold: parseStackItemBigInt(tuple[1], "GetGraduationProgress[1]"),
    progressBps: parseStackItemSafeNumber(tuple[2], "GetGraduationProgress[2]"),
    graduationReady: parseStackItemBoolean(tuple[3], "GetGraduationProgress[3]"),
  };
}

export async function getBondingCurveState(
  routerHash: string,
  tokenHash: string
): Promise<MarketCurveState> {
  const result = await invokeFunction(routerHash, "GetCurve", [
    { type: "Hash160", value: tokenHash },
  ]);

  return mapCurveTuple(tokenHash, result.stack);
}

export async function getBondingCurveBuyQuote(
  routerHash: string,
  tokenHash: string,
  quoteIn: bigint
): Promise<MarketBuyQuote> {
  const result = await invokeFunction(routerHash, "GetBuyQuote", [
    { type: "Hash160", value: tokenHash },
    { type: "Integer", value: quoteIn.toString() },
  ]);

  return mapBuyQuoteTuple(tokenHash, result.stack);
}

export async function getBondingCurveSellQuote(
  routerHash: string,
  tokenHash: string,
  tokenIn: bigint
): Promise<MarketSellQuote> {
  const result = await invokeFunction(routerHash, "GetSellQuote", [
    { type: "Hash160", value: tokenHash },
    { type: "Integer", value: tokenIn.toString() },
  ]);

  return mapSellQuoteTuple(tokenHash, result.stack);
}

export async function getBondingCurveGraduationProgress(
  routerHash: string,
  tokenHash: string
): Promise<MarketGraduationProgress> {
  const result = await invokeFunction(routerHash, "GetGraduationProgress", [
    { type: "Hash160", value: tokenHash },
  ]);

  return mapGraduationProgressTuple(tokenHash, result.stack);
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
