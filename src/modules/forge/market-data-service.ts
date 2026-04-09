import {
  getRuntimeBondingCurveRouterHash,
  getRuntimeFactoryHash,
} from "./forge-config";
import {
  getAllFactoryTokenHashes,
  getBondingCurveGraduationProgress,
  getBondingCurveState,
} from "./neo-rpc-client";
import { resolveTokenMetadata } from "./token-metadata-service";
import type {
  MarketCandle,
  MarketCandleProvider,
  MarketDiscoveryItem,
  MarketDiscoveryProvider,
  MarketEnhancementCapabilities,
  MarketEnhancementServices,
  MarketGraduationProgress,
  MarketHolderEntry,
  MarketHolderProvider,
  MarketLiveFeedProvider,
  MarketLiveTradeEvent,
  MarketPairReadModel,
  MarketTopTraderEntry,
  MarketTopTraderProvider,
  MarketTradeHistoryEntry,
  MarketTradeHistoryProvider,
  MarketTrendingProvider,
  MarketCurveState,
  MarketQuoteAsset,
  TokenInfo,
} from "./types";

export const BASELINE_MARKET_ENHANCEMENT_CAPABILITIES: MarketEnhancementCapabilities = {
  mode: "baseline",
  marketList: false,
  trendData: false,
  candles: false,
  tradeHistory: false,
  holders: false,
  topTraders: false,
  liveFeed: false,
  contractChangeFeed: true,
};

const unavailableDiscoveryProvider: MarketDiscoveryProvider = {
  isAvailable: () => false,
  async listPairs() {
    return [];
  },
};

const unavailableTrendingProvider: MarketTrendingProvider = {
  isAvailable: () => false,
  async listTrendingPairs() {
    return [];
  },
};

const unavailableCandleProvider: MarketCandleProvider = {
  isAvailable: () => false,
  async getCandles(): Promise<MarketCandle[]> {
    return [];
  },
};

const unavailableTradeHistoryProvider: MarketTradeHistoryProvider = {
  isAvailable: () => false,
  async getTrades(): Promise<MarketTradeHistoryEntry[]> {
    return [];
  },
};

const unavailableHolderProvider: MarketHolderProvider = {
  isAvailable: () => false,
  async getHolders(): Promise<MarketHolderEntry[]> {
    return [];
  },
};

const unavailableTopTraderProvider: MarketTopTraderProvider = {
  isAvailable: () => false,
  async getTopTraders(): Promise<MarketTopTraderEntry[]> {
    return [];
  },
};

const unavailableLiveFeedProvider: MarketLiveFeedProvider = {
  isAvailable: () => false,
  subscribe(tokenHash: string, onTrade: (event: MarketLiveTradeEvent) => void) {
    void tokenHash;
    void onTrade;
    return () => undefined;
  },
};

export const BASELINE_MARKET_ENHANCEMENT_SERVICES: MarketEnhancementServices = {
  discovery: unavailableDiscoveryProvider,
  trending: unavailableTrendingProvider,
  candles: unavailableCandleProvider,
  tradeHistory: unavailableTradeHistoryProvider,
  holders: unavailableHolderProvider,
  topTraders: unavailableTopTraderProvider,
  liveFeed: unavailableLiveFeedProvider,
};

function requireRouterHash(): string {
  const routerHash = getRuntimeBondingCurveRouterHash();
  if (!routerHash || routerHash === "0x") {
    throw new Error(
      "BondingCurveRouter contract hash is not configured. Set NEXT_PUBLIC_BONDING_CURVE_ROUTER_HASH."
    );
  }
  return routerHash;
}

function toPairHash(tokenHash: string): string {
  // In FEAT-075 baseline mode the canonical pair route is keyed by token hash.
  return tokenHash;
}

function buildPairLabel(token: TokenInfo, quoteAsset: MarketQuoteAsset): string {
  const base = token.symbol || token.contractHash.slice(0, 8);
  return `${base}/${quoteAsset}`;
}

function buildSearchableText(
  token: TokenInfo,
  pairHash: string,
  pairLabel: string
): string {
  return [
    token.contractHash,
    pairHash,
    token.symbol,
    token.name,
    pairLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortByNewest(left: MarketDiscoveryItem, right: MarketDiscoveryItem): number {
  const createdDelta = (right.createdAt ?? 0) - (left.createdAt ?? 0);
  if (createdDelta !== 0) return createdDelta;
  return left.pairLabel.localeCompare(right.pairLabel);
}

function filterPairs(
  pairs: MarketDiscoveryItem[],
  searchQuery?: string
): MarketDiscoveryItem[] {
  const normalized = searchQuery?.trim().toLowerCase();
  if (!normalized) return pairs;
  return pairs.filter((pair) => pair.searchableText.includes(normalized));
}

function deriveGraduationProgress(curve: MarketCurveState): MarketGraduationProgress {
  const progressBps =
    curve.graduationThreshold > 0n
      ? Number((curve.realQuote * 10_000n) / curve.graduationThreshold)
      : 0;

  return {
    tokenHash: curve.tokenHash,
    realQuote: curve.realQuote,
    graduationThreshold: curve.graduationThreshold,
    progressBps,
    graduationReady: curve.graduationReady,
  };
}

function toDiscoveryItem(token: TokenInfo, curve: MarketCurveState): MarketDiscoveryItem {
  const pairHash = toPairHash(token.contractHash);
  const pairLabel = buildPairLabel(token, curve.quoteAsset);

  return {
    pairHash,
    tokenHash: token.contractHash,
    pairLabel,
    token,
    quoteAsset: curve.quoteAsset,
    marketType: "BondingCurve",
    status: curve.status,
    contractStatus: curve.contractStatus,
    lastPrice: curve.currentPrice,
    volume24h: null,
    tradeCount24h: null,
    totalTrades: curve.totalTrades,
    createdAt: token.createdAt ?? curve.createdAt,
    launchCurveInventory: curve.curveInventory,
    launchRetainedInventory: curve.retainedInventory,
    totalSupply: curve.totalSupply,
    searchableText: buildSearchableText(token, pairHash, pairLabel),
    curve,
  };
}

export async function listBaselineMarketPairs(
  searchQuery?: string
): Promise<MarketDiscoveryItem[]> {
  const factoryHash = getRuntimeFactoryHash();
  if (!factoryHash || factoryHash === "0x") return [];

  const routerHash = requireRouterHash();
  const tokenHashes = await getAllFactoryTokenHashes(factoryHash);
  if (tokenHashes.length === 0) return [];

  const tokens = await Promise.all(tokenHashes.map(resolveTokenMetadata));
  const speculationTokens = tokens.filter((token) => token.mode === "speculative");
  if (speculationTokens.length === 0) return [];

  const curves = await Promise.allSettled(
    speculationTokens.map((token) => getBondingCurveState(routerHash, token.contractHash))
  );

  const pairs = speculationTokens.flatMap((token, index) => {
    const settled = curves[index];
    if (settled.status !== "fulfilled") {
      return [];
    }
    return [toDiscoveryItem(token, settled.value)];
  });

  return filterPairs(pairs, searchQuery).sort(sortByNewest);
}

export async function listBaselineTrendingMarkets(
  limit: number
): Promise<MarketDiscoveryItem[]> {
  if (limit <= 0) return [];
  const pairs = await listBaselineMarketPairs();
  return pairs.slice(0, limit);
}

export async function getBaselineMarketPair(
  tokenHash: string
): Promise<MarketPairReadModel | null> {
  if (!tokenHash) return null;

  const routerHash = requireRouterHash();
  const [token, curve] = await Promise.all([
    resolveTokenMetadata(tokenHash),
    getBondingCurveState(routerHash, tokenHash),
  ]);

  const graduation = await getBondingCurveGraduationProgress(routerHash, tokenHash).catch(() =>
    deriveGraduationProgress(curve)
  );

  return {
    pairHash: toPairHash(tokenHash),
    tokenHash,
    pairLabel: buildPairLabel(token, curve.quoteAsset),
    token,
    quoteAsset: curve.quoteAsset,
    marketType: "BondingCurve",
    curve,
    graduation,
    capabilities: BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
  };
}
