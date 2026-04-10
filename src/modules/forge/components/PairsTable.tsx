"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuoteAssetUsdReference } from "../hooks/useQuoteAssetUsdReference";
import {
  formatMarketPrice,
  formatQuoteAmountSummary,
  formatRelativeCreatedAt,
  formatUsdCompactAmount,
  formatUsdPrice,
  marketPriceToUsd,
  quoteAmountToUsd,
} from "../market-formatting";
import { TokenIcon } from "./TokenIcon";
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
  const { reference: gasUsdReference } = useQuoteAssetUsdReference("GAS");
  const { reference: neoUsdReference } = useQuoteAssetUsdReference("NEO");

  function openMarket(tokenHash: string) {
    router.push(`/markets/${tokenHash}`);
  }

  function truncateHash(hash: string): string {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  }

  function resolveQuoteAssetUsdPrice(quoteAsset: MarketDiscoveryItem["quoteAsset"]): number | null {
    return quoteAsset === "GAS"
      ? gasUsdReference?.priceUsd ?? null
      : neoUsdReference?.priceUsd ?? null;
  }

  return (
    <section
      className="overflow-hidden rounded-3xl"
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      {error ? (
        <div
          className="px-6 py-12 text-center"
          style={{ color: "var(--forge-text-muted)" }}
        >
          <p
            className="text-base font-medium"
            style={{ color: "var(--forge-text-primary)" }}
          >
            Pair data could not be loaded.
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
            No tradable markets yet.
          </p>
          <p className="mt-2">
            Launch or activate a speculation token from the Tokens page to make it appear here.
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
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Market Cap
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Reserve
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  24h Vol
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em]">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const quoteAssetUsdPrice = resolveQuoteAssetUsdPrice(item.quoteAsset);
                const reserve = item.curve?.realQuote ?? null;
                const marketCap =
                  item.lastPrice !== null && item.totalSupply !== null
                    ? (item.lastPrice * item.totalSupply) / 1_000_000_000_000_000_000n
                    : null;
                const reserveUsd = quoteAmountToUsd(
                  reserve,
                  item.quoteAsset,
                  quoteAssetUsdPrice
                );
                const volume24hUsd = quoteAmountToUsd(
                  item.volume24h,
                  item.quoteAsset,
                  quoteAssetUsdPrice
                );
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
                      <div className="flex items-center gap-3">
                        <TokenIcon
                          contractHash={item.token.contractHash}
                          imageUrl={item.token.imageUrl}
                          size={36}
                        />
                        <div className="min-w-0">
                          <p
                            className="truncate font-semibold"
                            style={{ color: "var(--forge-text-primary)" }}
                          >
                            {item.pairLabel}
                          </p>
                          <p
                            className="mt-1 text-xs"
                            style={{ color: "var(--forge-text-muted)" }}
                            title={item.token.contractHash}
                          >
                            {truncateHash(item.token.contractHash)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--forge-text-primary)" }}
                      >
                        {priceUsd !== null
                          ? formatUsdPrice(priceUsd)
                          : formatMarketPrice(
                              item.lastPrice,
                              item.quoteAsset,
                              item.token.decimals
                            )}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--forge-text-primary)" }}
                      >
                        {marketCapUsd !== null
                          ? formatUsdCompactAmount(marketCapUsd)
                          : formatQuoteAmountSummary(marketCap, item.quoteAsset)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--forge-text-primary)" }}
                      >
                        {reserveUsd !== null
                          ? formatUsdCompactAmount(reserveUsd)
                          : formatQuoteAmountSummary(reserve, item.quoteAsset)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--forge-text-primary)" }}
                      >
                        {volume24hUsd !== null
                          ? formatUsdCompactAmount(volume24hUsd)
                          : item.volume24h !== null
                            ? formatQuoteAmountSummary(item.volume24h, item.quoteAsset)
                            : "-"}
                      </span>
                    </td>
                    <td
                      className="px-4 py-4 text-sm"
                      style={{ color: "var(--forge-text-muted)" }}
                    >
                      {formatRelativeCreatedAt(item.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
