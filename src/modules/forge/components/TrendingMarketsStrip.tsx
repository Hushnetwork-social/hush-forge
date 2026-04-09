"use client";

import Link from "next/link";
import {
  formatCompactMarketCount,
  formatPairStatus,
  formatQuoteAmount,
} from "../market-formatting";
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
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p
            className="text-xs uppercase tracking-[0.24em]"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Latest Pairs
          </p>
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            Trending now
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
          Direct-RPC baseline: newest speculation pairs first
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <TrendingCardSkeleton key={index} />
            ))
          : items.map((item, index) => (
              <Link
                key={item.pairHash}
                href={`/markets/${item.tokenHash}`}
                className={`min-w-[220px] rounded-2xl p-4 transition-transform hover:-translate-y-1 ${
                  index >= 3 ? "md:hidden lg:block" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                  border: "1px solid var(--forge-border-subtle)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--forge-text-primary)" }}
                    >
                      {item.pairLabel}
                    </p>
                    <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
                      {item.token.name || item.token.symbol}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2 py-1 text-[11px] font-semibold"
                    style={{
                      background: "rgba(255,107,53,0.14)",
                      color: "var(--forge-color-primary)",
                    }}
                  >
                    {formatPairStatus(item.status)}
                  </span>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <p
                    className="text-lg font-semibold"
                    style={{ color: "var(--forge-text-primary)" }}
                  >
                    {formatQuoteAmount(item.lastPrice, item.quoteAsset)}
                  </p>
                  <div
                    className="flex items-center justify-between text-xs"
                    style={{ color: "var(--forge-text-muted)" }}
                  >
                    <span>Trades</span>
                    <span>{formatCompactMarketCount(item.totalTrades)}</span>
                  </div>
                  <div
                    className="flex items-center justify-between text-xs"
                    style={{ color: "var(--forge-text-muted)" }}
                  >
                    <span>Launch inventory</span>
                    <span>{formatCompactMarketCount(item.launchCurveInventory)}</span>
                  </div>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}
