"use client";

import { useEffect, useState } from "react";
import {
  BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
  getBaselineMarketPair,
} from "../market-data-service";
import type { MarketEnhancementCapabilities, MarketPairReadModel } from "../types";

export interface MarketPairResult {
  pair: MarketPairReadModel | null;
  capabilities: MarketEnhancementCapabilities;
  loading: boolean;
  error: string | null;
}

interface MarketPairState {
  pair: MarketPairReadModel | null;
  resolvedTokenHash: string | null;
  error: string | null;
}

export function useMarketPair(tokenHash: string): MarketPairResult {
  const [state, setState] = useState<MarketPairState>({
    pair: null,
    resolvedTokenHash: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!tokenHash) {
      return () => {
        cancelled = true;
      };
    }

    getBaselineMarketPair(tokenHash)
      .then((nextPair) => {
        if (cancelled) return;
        setState({
          pair: nextPair,
          resolvedTokenHash: tokenHash,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          pair: null,
          resolvedTokenHash: tokenHash,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [tokenHash]);

  if (!tokenHash) {
    return {
      pair: null,
      capabilities: BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
      loading: false,
      error: null,
    };
  }

  const loading = state.resolvedTokenHash !== tokenHash;

  return {
    pair: loading ? null : state.pair,
    capabilities: BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
    loading,
    error: loading ? null : state.error,
  };
}
