"use client";

import { useEffect, useState } from "react";
import { getRuntimeBondingCurveRouterHash } from "../forge-config";
import {
  isMarketDataInvalidationForToken,
  MARKET_DATA_INVALIDATED_EVENT,
  type MarketDataInvalidatedDetail,
} from "../market-data-events";
import type { MarketActivitySnapshot } from "../types";

const REFRESH_INTERVAL_MS = 15_000;

interface SerializedMarketActivitySnapshot {
  tokenHash: string;
  interval: "15m";
  indexedThroughBlock: number;
  indexedAt: number;
  candles: Array<{
    time: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  trades: Array<{
    id: string;
    occurredAt: number;
    side: "buy" | "sell";
    trader: string;
    quoteAsset: "GAS" | "NEO";
    quoteAmount: string;
    tokenAmount: string;
    price: string;
    txHash: string;
  }>;
  holders: Array<{
    rank: number;
    address: string;
    balance: string;
    shareBps: number | null;
  }>;
  topTraders: Array<{
    rank: number;
    address: string;
    totalTrades: number;
    buyVolume: string;
    sellVolume: string;
    netQuoteVolume: string;
  }>;
}

export interface UseMarketActivityResult {
  activity: MarketActivitySnapshot | null;
  loading: boolean;
  error: string | null;
}

function deserializeSnapshot(
  payload: SerializedMarketActivitySnapshot
): MarketActivitySnapshot {
  return {
    tokenHash: payload.tokenHash,
    interval: payload.interval,
    indexedThroughBlock: payload.indexedThroughBlock,
    indexedAt: payload.indexedAt,
    candles: payload.candles.map((candle) => ({
      time: candle.time,
      open: BigInt(candle.open),
      high: BigInt(candle.high),
      low: BigInt(candle.low),
      close: BigInt(candle.close),
      volume: BigInt(candle.volume),
    })),
    trades: payload.trades.map((trade) => ({
      ...trade,
      quoteAmount: BigInt(trade.quoteAmount),
      tokenAmount: BigInt(trade.tokenAmount),
      price: BigInt(trade.price),
    })),
    holders: payload.holders.map((holder) => ({
      ...holder,
      balance: BigInt(holder.balance),
    })),
    topTraders: payload.topTraders.map((trader) => ({
      ...trader,
      buyVolume: BigInt(trader.buyVolume),
      sellVolume: BigInt(trader.sellVolume),
      netQuoteVolume: BigInt(trader.netQuoteVolume),
    })),
  };
}

export function useMarketActivity(tokenHash: string | null): UseMarketActivityResult {
  const [activity, setActivity] = useState<MarketActivitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;

    if (!tokenHash) {
      setActivity(null);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    const activeTokenHash = tokenHash;

    async function loadActivity() {
      if (requestInFlight) {
        return;
      }

      requestInFlight = true;
      try {
        const routerHash = getRuntimeBondingCurveRouterHash();
        const query = routerHash
          ? `?routerHash=${encodeURIComponent(routerHash)}`
          : "";
        const response = await fetch(`/api/markets/${activeTokenHash}/activity${query}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            payload?.error ?? `On-chain activity unavailable: HTTP ${response.status}`
          );
        }

        const payload =
          (await response.json()) as SerializedMarketActivitySnapshot;
        if (cancelled) {
          return;
        }

        setActivity(deserializeSnapshot(payload));
        setError(null);
      } catch (fetchError) {
        if (cancelled) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load on-chain activity."
        );
      } finally {
        requestInFlight = false;
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setActivity(null);
    setError(null);
    setLoading(true);
    void loadActivity();
    function handleInvalidated(event: Event) {
      const detail = (event as CustomEvent<MarketDataInvalidatedDetail>).detail;
      if (isMarketDataInvalidationForToken(detail, activeTokenHash)) {
        void loadActivity();
      }
    }

    window.addEventListener(
      MARKET_DATA_INVALIDATED_EVENT,
      handleInvalidated as EventListener
    );
    const timer = window.setInterval(() => {
      void loadActivity();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(
        MARKET_DATA_INVALIDATED_EVENT,
        handleInvalidated as EventListener
      );
    };
  }, [tokenHash]);

  return { activity, loading, error };
}
