"use client";

import { useEffect, useState } from "react";
import type { MarketQuoteAsset } from "../types";

const REFRESH_INTERVAL_MS = 60_000;

export interface QuoteAssetUsdReference {
  asset: MarketQuoteAsset;
  provider: string;
  priceUsd: number;
  lastUpdatedAt: number | null;
}

export interface UseQuoteAssetUsdReferenceResult {
  reference: QuoteAssetUsdReference | null;
  loading: boolean;
  error: string | null;
}

interface MarketReferenceResponse {
  provider: string;
  prices: Partial<
    Record<
      MarketQuoteAsset,
      {
        usd: number;
        lastUpdatedAt: number | null;
      }
    >
  >;
}

export function useQuoteAssetUsdReference(
  quoteAsset: MarketQuoteAsset
): UseQuoteAssetUsdReferenceResult {
  const [reference, setReference] = useState<QuoteAssetUsdReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReference() {
      try {
        const response = await fetch(`/api/market-reference?asset=${quoteAsset}`);
        if (!response.ok) {
          throw new Error(`USD reference unavailable: HTTP ${response.status}`);
        }

        const payload = (await response.json()) as MarketReferenceResponse;
        const priceEntry = payload.prices[quoteAsset];

        if (!priceEntry || typeof priceEntry.usd !== "number") {
          throw new Error(`USD reference unavailable for ${quoteAsset}`);
        }

        if (cancelled) return;
        setReference({
          asset: quoteAsset,
          provider: payload.provider,
          priceUsd: priceEntry.usd,
          lastUpdatedAt: priceEntry.lastUpdatedAt ?? null,
        });
        setError(null);
      } catch (fetchError) {
        if (cancelled) return;
        setReference(null);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load USD reference."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    void loadReference();
    const timer = window.setInterval(() => {
      void loadReference();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [quoteAsset]);

  return { reference, loading, error };
}
