import * as Neon from "@cityofzion/neon-js";
import type {
  ApplicationLog,
  MarketActivitySnapshot,
  MarketCandle,
  MarketHolderEntry,
  MarketQuoteAsset,
  MarketTopTraderEntry,
  MarketTradeHistoryEntry,
  RpcStackItem,
} from "./types";

const FIFTEEN_MINUTES_SECONDS = 15 * 60;
const ZERO_HASH = "0x0000000000000000000000000000000000000000";
const DEFAULT_LIMIT = 25;
const MAX_STORED_TRADES = 500;

interface JsonRpcSuccess<T> {
  jsonrpc: string;
  id: number;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc: string;
  id: number;
  error: {
    code: number;
    message: string;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

interface RpcBlockTransaction {
  hash: string;
}

interface RpcBlock {
  hash: string;
  index: number;
  time: number;
  tx: Array<string | RpcBlockTransaction>;
}

interface MutableCandle {
  time: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
}

interface MutableTraderStats {
  totalTrades: number;
  buyVolume: bigint;
  sellVolume: bigint;
}

interface ParsedTradeEvent {
  tokenHash: string;
  traderHash: string;
  side: "buy" | "sell";
  quoteAsset: MarketQuoteAsset;
  quoteAmount: bigint;
  tokenAmount: bigint;
  price: bigint;
}

interface ParsedTransferEvent {
  fromHash: string | null;
  toHash: string | null;
  amount: bigint;
}

interface TokenActivityCacheEntry {
  lastIndexedBlock: number;
  candles: Map<number, MutableCandle>;
  trades: MarketTradeHistoryEntry[];
  holderBalances: Map<string, bigint>;
  traderStats: Map<string, MutableTraderStats>;
  inflight: Promise<MarketActivitySnapshot> | null;
  snapshot: MarketActivitySnapshot | null;
}

interface MarketActivityCacheStore {
  entries: Map<string, TokenActivityCacheEntry>;
}

function getGlobalCache(): MarketActivityCacheStore {
  const globalCache = globalThis as typeof globalThis & {
    __forgeMarketActivityCache__?: MarketActivityCacheStore;
  };

  if (!globalCache.__forgeMarketActivityCache__) {
    globalCache.__forgeMarketActivityCache__ = {
      entries: new Map(),
    };
  }

  return globalCache.__forgeMarketActivityCache__;
}

function normalizeHash(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function normalizeTimestampToMs(raw: number): number {
  return raw > 10_000_000_000 ? raw : raw * 1000;
}

function normalizeTimestampToSeconds(raw: number): number {
  return raw > 10_000_000_000 ? Math.floor(raw / 1000) : raw;
}

function toBucketStartSeconds(raw: number): number {
  const timestampSeconds = normalizeTimestampToSeconds(raw);
  return Math.floor(timestampSeconds / FIFTEEN_MINUTES_SECONDS) * FIFTEEN_MINUTES_SECONDS;
}

function getOrCreateEntry(cacheKey: string): TokenActivityCacheEntry {
  const store = getGlobalCache();
  const existing = store.entries.get(cacheKey);
  if (existing) {
    return existing;
  }

  const created: TokenActivityCacheEntry = {
    lastIndexedBlock: -1,
    candles: new Map(),
    trades: [],
    holderBalances: new Map(),
    traderStats: new Map(),
    inflight: null,
    snapshot: null,
  };

  store.entries.set(cacheKey, created);
  return created;
}

function resetEntry(entry: TokenActivityCacheEntry): void {
  entry.lastIndexedBlock = -1;
  entry.candles.clear();
  entry.trades = [];
  entry.holderBalances.clear();
  entry.traderStats.clear();
  entry.snapshot = null;
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Neo RPC ${method} failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if ("error" in payload) {
    throw new Error(`Neo RPC error: ${payload.error.message}`);
  }

  return payload.result;
}

async function getBlockCount(rpcUrl: string): Promise<number> {
  return rpcCall<number>(rpcUrl, "getblockcount", []);
}

async function getBlock(rpcUrl: string, index: number): Promise<RpcBlock> {
  return rpcCall<RpcBlock>(rpcUrl, "getblock", [index, 1]);
}

async function getApplicationLog(
  rpcUrl: string,
  txHash: string
): Promise<ApplicationLog | null> {
  try {
    return await rpcCall<ApplicationLog>(rpcUrl, "getapplicationlog", [txHash]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unknown transaction/i.test(message)) {
      return null;
    }
    throw error;
  }
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function parseBigInt(item: RpcStackItem | undefined): bigint {
  if (!item) {
    return 0n;
  }

  if (item.type === "Integer") {
    return BigInt(String(item.value));
  }

  if (item.type === "ByteString" || item.type === "ByteArray") {
    const bytes = decodeBase64(String(item.value));
    if (bytes.length === 0) {
      return 0n;
    }

    let value = 0n;
    for (let index = bytes.length - 1; index >= 0; index -= 1) {
      value = (value << 8n) | BigInt(bytes[index]);
    }
    return value;
  }

  if (item.type === "String") {
    return BigInt(String(item.value));
  }

  if (item.type === "Boolean") {
    return item.value ? 1n : 0n;
  }

  return 0n;
}

function parseText(item: RpcStackItem | undefined): string {
  if (!item) {
    return "";
  }

  if (item.type === "String") {
    return String(item.value);
  }

  if (item.type === "ByteString" || item.type === "ByteArray") {
    return Buffer.from(String(item.value), "base64").toString("utf8");
  }

  return String(item.value ?? "");
}

function parseHash160(item: RpcStackItem | undefined): string | null {
  if (!item || item.type === "Any" || item.type === "Null") {
    return null;
  }

  if (item.type === "String") {
    const value = String(item.value ?? "");
    if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
      return normalizeHash(value);
    }
  }

  if (item.type === "ByteString" || item.type === "ByteArray") {
    const bytes = [...decodeBase64(String(item.value))].reverse();
    if (bytes.length !== 20) {
      return null;
    }
    return `0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  return null;
}

function normalizeQuoteAsset(value: string): MarketQuoteAsset | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "GAS" || normalized === "NEO") {
    return normalized;
  }
  return null;
}

function toDisplayAddress(hash: string): string {
  try {
    return Neon.wallet.getAddressFromScriptHash(hash.slice(2));
  } catch {
    return hash;
  }
}

function parseTradeEvent(notification: ApplicationLog["executions"][number]["notifications"][number]): ParsedTradeEvent | null {
  if (notification.eventname !== "Trade" || notification.state?.type !== "Array") {
    return null;
  }

  const values = notification.state.value;
  if (!Array.isArray(values) || values.length < 9) {
    return null;
  }

  const tokenHash = parseHash160(values[0]);
  const traderHash = parseHash160(values[1]);
  const side = parseText(values[2]).trim().toLowerCase();
  const quoteAsset = normalizeQuoteAsset(parseText(values[3]));

  if (!tokenHash || !traderHash || !quoteAsset) {
    return null;
  }

  if (side !== "buy" && side !== "sell") {
    return null;
  }

  return {
    tokenHash,
    traderHash,
    side,
    quoteAsset,
    quoteAmount: parseBigInt(values[6]),
    tokenAmount: parseBigInt(values[7]),
    price: parseBigInt(values[8]),
  };
}

function parseTransferEvent(
  notification: ApplicationLog["executions"][number]["notifications"][number]
): ParsedTransferEvent | null {
  if (notification.eventname !== "Transfer" || notification.state?.type !== "Array") {
    return null;
  }

  const values = notification.state.value;
  if (!Array.isArray(values) || values.length < 3) {
    return null;
  }

  return {
    fromHash: parseHash160(values[0]),
    toHash: parseHash160(values[1]),
    amount: parseBigInt(values[2]),
  };
}

export function applyTradeToCandle(
  candles: Map<number, MutableCandle>,
  trade: MarketTradeHistoryEntry
): void {
  const bucketStart = toBucketStartSeconds(trade.occurredAt);
  const existing = candles.get(bucketStart);

  if (!existing) {
    candles.set(bucketStart, {
      time: bucketStart,
      open: trade.price,
      high: trade.price,
      low: trade.price,
      close: trade.price,
      volume: trade.quoteAmount,
    });
    return;
  }

  if (trade.price > existing.high) existing.high = trade.price;
  if (trade.price < existing.low) existing.low = trade.price;
  existing.close = trade.price;
  existing.volume += trade.quoteAmount;
}

export function buildContinuousCandles(
  rawCandles: MarketCandle[],
  indexedAt: number
): MarketCandle[] {
  const sorted = [...rawCandles].sort((left, right) => left.time - right.time);
  if (sorted.length === 0) {
    return [];
  }

  const candlesByTime = new Map(sorted.map((candle) => [candle.time, candle]));
  const firstBucket = sorted[0].time;
  const lastBucket = Math.max(
    sorted[sorted.length - 1].time,
    toBucketStartSeconds(indexedAt)
  );
  const continuous: MarketCandle[] = [];
  let previousClose: bigint | null = null;

  for (
    let bucketStart = firstBucket;
    bucketStart <= lastBucket;
    bucketStart += FIFTEEN_MINUTES_SECONDS
  ) {
    const rawCandle = candlesByTime.get(bucketStart);

    if (!rawCandle) {
      if (previousClose === null) {
        continue;
      }

      continuous.push({
        time: bucketStart,
        open: previousClose,
        high: previousClose,
        low: previousClose,
        close: previousClose,
        volume: 0n,
      });
      continue;
    }

    const open = previousClose ?? rawCandle.open;
    const high = rawCandle.high > open ? rawCandle.high : open;
    const low = rawCandle.low < open ? rawCandle.low : open;

    continuous.push({
      time: bucketStart,
      open,
      high,
      low,
      close: rawCandle.close,
      volume: rawCandle.volume,
    });
    previousClose = rawCandle.close;
  }

  return continuous;
}

function applyTransferBalance(
  balances: Map<string, bigint>,
  holderHash: string | null,
  delta: bigint
): void {
  if (!holderHash || holderHash === ZERO_HASH || delta === 0n) {
    return;
  }

  const next = (balances.get(holderHash) ?? 0n) + delta;
  if (next <= 0n) {
    balances.delete(holderHash);
    return;
  }

  balances.set(holderHash, next);
}

export function buildHolderEntries(
  balances: Map<string, bigint>,
  routerHash: string,
  limit = DEFAULT_LIMIT
): MarketHolderEntry[] {
  const normalizedRouter = normalizeHash(routerHash);
  const outstandingSupply = [...balances.entries()].reduce((sum, [hash, amount]) => {
    if (hash === normalizedRouter || hash === ZERO_HASH || amount <= 0n) {
      return sum;
    }
    return sum + amount;
  }, 0n);

  return [...balances.entries()]
    .filter(([hash, amount]) => hash !== normalizedRouter && hash !== ZERO_HASH && amount > 0n)
    .sort((left, right) => {
      if (left[1] === right[1]) {
        return left[0].localeCompare(right[0]);
      }
      return right[1] > left[1] ? 1 : -1;
    })
    .slice(0, limit)
    .map(([hash, balance], index) => ({
      rank: index + 1,
      address: toDisplayAddress(hash),
      balance,
      shareBps:
        outstandingSupply > 0n
          ? Number((balance * 10_000n) / outstandingSupply)
          : null,
    }));
}

export function buildTopTraderEntries(
  traderStats: Map<string, MutableTraderStats>,
  limit = DEFAULT_LIMIT
): MarketTopTraderEntry[] {
  return [...traderStats.entries()]
    .sort((left, right) => {
      const leftVolume = left[1].buyVolume + left[1].sellVolume;
      const rightVolume = right[1].buyVolume + right[1].sellVolume;

      if (left[1].totalTrades !== right[1].totalTrades) {
        return right[1].totalTrades - left[1].totalTrades;
      }
      if (leftVolume !== rightVolume) {
        return rightVolume > leftVolume ? 1 : -1;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([hash, stats], index) => ({
      rank: index + 1,
      address: toDisplayAddress(hash),
      totalTrades: stats.totalTrades,
      buyVolume: stats.buyVolume,
      sellVolume: stats.sellVolume,
      netQuoteVolume: stats.buyVolume - stats.sellVolume,
    }));
}

function buildSnapshot(
  tokenHash: string,
  routerHash: string,
  indexedThroughBlock: number,
  entry: TokenActivityCacheEntry
): MarketActivitySnapshot {
  const snapshotTime = Date.now();
  const candles = buildContinuousCandles(
    [...entry.candles.values()],
    snapshotTime
  );
  const trades = [...entry.trades]
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 50);

  return {
    tokenHash,
    interval: "15m",
    indexedThroughBlock,
    indexedAt: snapshotTime,
    candles,
    trades,
    holders: buildHolderEntries(entry.holderBalances, routerHash, 25),
    topTraders: buildTopTraderEntries(entry.traderStats, 25),
  };
}

async function indexBlockForToken(
  rpcUrl: string,
  tokenHash: string,
  routerHash: string,
  entry: TokenActivityCacheEntry,
  block: RpcBlock
): Promise<void> {
  const normalizedTokenHash = normalizeHash(tokenHash);
  const normalizedRouterHash = normalizeHash(routerHash);
  const occurredAt = normalizeTimestampToMs(block.time);
  const txHashes = (block.tx ?? []).map((tx) =>
    typeof tx === "string" ? tx : tx.hash
  );

  const logs = await Promise.all(
    txHashes.map(async (txHash) => ({
      txHash,
      log: await getApplicationLog(rpcUrl, txHash),
    }))
  );

  for (const { txHash, log } of logs) {
    if (!log) {
      continue;
    }

    for (const execution of log.executions ?? []) {
      const notifications = execution.notifications ?? [];
      for (let index = 0; index < notifications.length; index += 1) {
        const notification = notifications[index];
        const contractHash = normalizeHash(notification.contract);

        if (contractHash === normalizedRouterHash && notification.eventname === "Trade") {
          const trade = parseTradeEvent(notification);
          if (!trade || normalizeHash(trade.tokenHash) !== normalizedTokenHash) {
            continue;
          }

          const tradeEntry: MarketTradeHistoryEntry = {
            id: `${txHash}:${index}`,
            occurredAt,
            side: trade.side,
            trader: toDisplayAddress(trade.traderHash),
            quoteAsset: trade.quoteAsset,
            quoteAmount: trade.quoteAmount,
            tokenAmount: trade.tokenAmount,
            price: trade.price,
            txHash,
          };

          entry.trades.push(tradeEntry);
          if (entry.trades.length > MAX_STORED_TRADES) {
            entry.trades.splice(0, entry.trades.length - MAX_STORED_TRADES);
          }
          applyTradeToCandle(entry.candles, tradeEntry);

          const stats = entry.traderStats.get(trade.traderHash) ?? {
            totalTrades: 0,
            buyVolume: 0n,
            sellVolume: 0n,
          };
          stats.totalTrades += 1;
          if (trade.side === "buy") {
            stats.buyVolume += trade.quoteAmount;
          } else {
            stats.sellVolume += trade.quoteAmount;
          }
          entry.traderStats.set(trade.traderHash, stats);
          continue;
        }

        if (contractHash === normalizedTokenHash && notification.eventname === "Transfer") {
          const transfer = parseTransferEvent(notification);
          if (!transfer) {
            continue;
          }

          applyTransferBalance(entry.holderBalances, transfer.fromHash, -transfer.amount);
          applyTransferBalance(entry.holderBalances, transfer.toHash, transfer.amount);
        }
      }
    }
  }
}

export async function getMarketActivitySnapshot(params: {
  tokenHash: string;
  routerHash: string;
  rpcUrl: string;
}): Promise<MarketActivitySnapshot> {
  const tokenHash = normalizeHash(params.tokenHash);
  const routerHash = normalizeHash(params.routerHash);
  const rpcUrl = params.rpcUrl;
  const cacheKey = `${rpcUrl}|${routerHash}|${tokenHash}`;
  const entry = getOrCreateEntry(cacheKey);

  if (entry.inflight) {
    return entry.inflight;
  }

  entry.inflight = (async () => {
    const blockCount = await getBlockCount(rpcUrl);
    if (entry.lastIndexedBlock >= blockCount) {
      resetEntry(entry);
    }

    for (let blockIndex = entry.lastIndexedBlock + 1; blockIndex < blockCount; blockIndex += 1) {
      const block = await getBlock(rpcUrl, blockIndex);
      await indexBlockForToken(rpcUrl, tokenHash, routerHash, entry, block);
      entry.lastIndexedBlock = block.index;
    }

    const snapshot = buildSnapshot(tokenHash, routerHash, Math.max(entry.lastIndexedBlock, 0), entry);
    entry.snapshot = snapshot;
    return snapshot;
  })().finally(() => {
    entry.inflight = null;
  });

  return entry.inflight;
}
