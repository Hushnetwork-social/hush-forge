"use client";

import Link from "next/link";
import {
  formatMarketPrice,
  formatQuoteAmountSummary,
  formatRelativeCreatedAt,
  formatUsdCompactAmount,
  formatUsdPrice,
  marketPriceToUsd,
  quoteAmountToUsd,
} from "../market-formatting";
import { useQuoteAssetUsdReference } from "../hooks/useQuoteAssetUsdReference";
import { TokenIcon } from "./TokenIcon";
import type { MarketDiscoveryItem } from "../types";

interface Props {
  items: MarketDiscoveryItem[];
  loading?: boolean;
}

function TrendingCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading market"
      className="h-36 min-w-[220px] animate-pulse rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    />
  );
}

export function TrendingMarketsStrip({ items, loading = false }: Props) {
  const { reference: gasUsdReference } = useQuoteAssetUsdReference("GAS");
  const { reference: neoUsdReference } = useQuoteAssetUsdReference("NEO");

  if (!loading && items.length === 0) {
    return null;
  }

  function resolveQuoteAssetUsdPrice(quoteAsset: MarketDiscoveryItem["quoteAsset"]): number | null {
    return quoteAsset === "GAS"
      ? gasUsdReference?.priceUsd ?? null
      : neoUsdReference?.priceUsd ?? null;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2
        className="text-2xl font-semibold"
        style={{ color: "var(--forge-text-primary)" }}
      >
        Trending now
      </h2>

      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 py-2">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <TrendingCardSkeleton key={index} />
            ))
          : items.map((item, index) => (
              (() => {
                const quoteAssetUsdPrice = resolveQuoteAssetUsdPrice(item.quoteAsset);
                const marketCap =
                  item.lastPrice !== null && item.totalSupply !== null
                    ? (item.lastPrice * item.totalSupply) / 1_000_000_000_000_000_000n
                    : null;
                const priceUsd = marketPriceToUsd(
                  item.lastPrice,
                  item.quoteAsset,
                  item.token.decimals,
                  quoteAssetUsdPrice
                );
                const marketCapUsd = quoteAmountToUsd(
                  marketCap,
                  item.quoteAsset,
                  quoteAssetUsdPrice
                );

                return (
                  <Link
                    key={item.pairHash}
                    href={`/markets/${item.tokenHash}`}
                    className={`min-w-[240px] origin-center rounded-2xl p-4 transition-all duration-200 hover:scale-[1.02] ${
                      index >= 3 ? "md:hidden lg:block" : ""
                    }`}
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                      border: "1px solid var(--forge-border-subtle)",
                      boxShadow: "0 16px 30px rgba(0,0,0,0.14)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon
                        contractHash={item.token.contractHash}
                        imageUrl={item.token.imageUrl}
                        size={34}
                      />
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-semibold"
                          style={{ color: "var(--forge-text-primary)" }}
                        >
                          {item.pairLabel}
                        </p>
                        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
                          {formatRelativeCreatedAt(item.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2">
                      <p
                        className="text-lg font-semibold"
                        style={{ color: "var(--forge-text-primary)" }}
                      >
                        {priceUsd !== null
                          ? formatUsdPrice(priceUsd)
                          : formatMarketPrice(
                              item.lastPrice,
                              item.quoteAsset,
                              item.token.decimals
                            )}
                      </p>
                      <div
                        className="flex items-center justify-between text-xs"
                        style={{ color: "var(--forge-text-muted)" }}
                      >
                        <span>Market cap</span>
                        <span>
                          {marketCapUsd !== null
                            ? formatUsdCompactAmount(marketCapUsd)
                            : formatQuoteAmountSummary(marketCap, item.quoteAsset)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })()
            ))}
      </div>
    </section>
  );
}
