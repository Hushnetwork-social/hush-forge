"use client";

import { useEffect, useState } from "react";
import {
  BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
  getBaselineMarketPair,
} from "../market-data-service";
import {
  isMarketDataInvalidationForToken,
  MARKET_DATA_INVALIDATED_EVENT,
  type MarketDataInvalidatedDetail,
} from "../market-data-events";
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<MarketPairState>({
    pair: null,
    resolvedTokenHash: null,
    error: null,
  });

  useEffect(() => {
    if (!tokenHash || typeof window === "undefined") {
      return () => undefined;
    }

    function handleInvalidated(event: Event) {
      const detail = (event as CustomEvent<MarketDataInvalidatedDetail>).detail;
      if (isMarketDataInvalidationForToken(detail, tokenHash)) {
        setRefreshVersion((current) => current + 1);
      }
    }

    window.addEventListener(
      MARKET_DATA_INVALIDATED_EVENT,
      handleInvalidated as EventListener
    );

    return () => {
      window.removeEventListener(
        MARKET_DATA_INVALIDATED_EVENT,
        handleInvalidated as EventListener
      );
    };
  }, [tokenHash]);

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
  }, [refreshVersion, tokenHash]);

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
