"use client";

import { useEffect, useState } from "react";
import {
  BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
  listBaselineMarketPairs,
  listBaselineTrendingMarkets,
} from "../market-data-service";
import type { MarketDiscoveryItem, MarketEnhancementCapabilities } from "../types";

export interface MarketPairsResult {
  pairs: MarketDiscoveryItem[];
  trendingPairs: MarketDiscoveryItem[];
  capabilities: MarketEnhancementCapabilities;
  loading: boolean;
  error: string | null;
}

interface MarketPairsState {
  pairs: MarketDiscoveryItem[];
  trendingPairs: MarketDiscoveryItem[];
  resolvedQuery: string | null;
  error: string | null;
}

export function useMarketPairs(searchQuery = ""): MarketPairsResult {
  const [state, setState] = useState<MarketPairsState>({
    pairs: [],
    trendingPairs: [],
    resolvedQuery: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listBaselineMarketPairs(searchQuery),
      listBaselineTrendingMarkets(5),
    ])
      .then(([nextPairs, nextTrending]) => {
        if (cancelled) return;
        setState({
          pairs: nextPairs,
          trendingPairs: nextTrending,
          resolvedQuery: searchQuery,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          pairs: [],
          trendingPairs: [],
          resolvedQuery: searchQuery,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  const loading = state.resolvedQuery !== searchQuery;

  return {
    pairs: loading ? [] : state.pairs,
    trendingPairs: loading ? [] : state.trendingPairs,
    capabilities: BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
    loading,
    error: loading ? null : state.error,
  };
}
