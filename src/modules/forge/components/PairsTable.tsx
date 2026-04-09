"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatCompactMarketCount,
  formatPairStatus,
  formatQuoteAmount,
} from "../market-formatting";
import type { MarketDiscoveryItem } from "../types";

interface Props {
  items: MarketDiscoveryItem[];
  loading?: boolean;
  error?: string | null;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, index) => (
        <td key={index} className="px-4 py-4">
          <div
            className="h-4 rounded"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
        </td>
      ))}
    </tr>
  );
}

export function PairsTable({ items, loading = false, error = null }: Props) {
  const router = useRouter();

  function openMarket(tokenHash: string) {
    router.push(`/markets/${tokenHash}`);
  }

  return (
    <section
      className="overflow-hidden rounded-3xl"
      style={{
        background: "rgba(12, 18, 31, 0.86)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div
        className="flex items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--forge-border-subtle)" }}
      >
        <div>
          <p
            className="text-xs uppercase tracking-[0.24em]"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Pairs
          </p>
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            Public markets
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
          Canonical bonding-curve pairs only
        </p>
      </div>

      {error ? (
        <div
          className="px-6 py-12 text-center"
          style={{ color: "var(--forge-text-muted)" }}
        >
          <p
            className="text-base font-medium"
            style={{ color: "var(--forge-text-primary)" }}
          >
            Market data is temporarily unavailable.
          </p>
          <p className="mt-2">{error}</p>
        </div>
      ) : loading ? (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <tbody>
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonRow key={index} />
              ))}
            </tbody>
          </table>
        </div>
      ) : items.length === 0 ? (
        <div
          className="px-6 py-12 text-center"
          style={{ color: "var(--forge-text-muted)" }}
        >
          <p
            className="text-base font-medium"
            style={{ color: "var(--forge-text-primary)" }}
          >
            No live markets yet.
          </p>
          <p className="mt-2">
            Launch a speculation token from the creator dashboard to make it appear here.
          </p>
          <Link
            href="/tokens"
            className="mt-5 inline-flex rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: "var(--forge-color-primary)",
              color: "var(--forge-text-primary)",
            }}
          >
            Open Tokens
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ color: "var(--forge-text-muted)" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Pair
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Quote
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Trades
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  State
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.22em]">
                  Open
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.pairHash}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${item.pairLabel}`}
                  onClick={() => openMarket(item.tokenHash)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMarket(item.tokenHash);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-white/5 focus-visible:outline-none"
                  style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
                >
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <span
                        className="font-semibold"
                        style={{ color: "var(--forge-text-primary)" }}
                      >
                        {item.pairLabel}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--forge-text-muted)" }}
                      >
                        {item.token.contractHash}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-4 py-4 text-sm"
                    style={{ color: "var(--forge-text-muted)" }}
                  >
                    {item.quoteAsset}
                  </td>
                  <td
                    className="px-4 py-4 text-sm font-medium"
                    style={{ color: "var(--forge-text-primary)" }}
                  >
                    {formatQuoteAmount(item.lastPrice, item.quoteAsset)}
                  </td>
                  <td
                    className="px-4 py-4 text-sm"
                    style={{ color: "var(--forge-text-muted)" }}
                  >
                    {formatCompactMarketCount(item.totalTrades)}
                  </td>
                  <td
                    className="px-4 py-4 text-sm"
                    style={{ color: "var(--forge-text-primary)" }}
                  >
                    {formatPairStatus(item.status)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/markets/${item.tokenHash}`}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex rounded-full px-3 py-1.5 text-sm font-semibold"
                      style={{
                        background: "rgba(255,107,53,0.14)",
                        color: "var(--forge-color-primary)",
                      }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
