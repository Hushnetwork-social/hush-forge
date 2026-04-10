"use client";
import { getLaunchProfileDefinition } from "../market-launch-profiles";
import {
  formatQuoteAmountSummary,
  formatMarketPrice,
  formatPairStatus,
  formatQuoteAmount,
  formatRelativeCreatedAt,
  formatTokenDisplayRounded,
  formatUsdCompactAmount,
  formatUsdPrice,
  marketPriceToUsd,
  quoteAmountToUsd,
} from "../market-formatting";
import { useQuoteAssetUsdReference } from "../hooks/useQuoteAssetUsdReference";
import type { MarketPairReadModel } from "../types";

interface Props {
  pair: MarketPairReadModel;
}

function Badge({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "accent" | "success";
}) {
  const palette =
    tone === "accent"
      ? {
          background: "rgba(255,107,53,0.14)",
          color: "var(--forge-color-primary)",
        }
      : tone === "success"
        ? {
            background: "rgba(32,201,151,0.14)",
            color: "#20c997",
          }
        : {
            background: "rgba(255,255,255,0.05)",
            color: "var(--forge-text-muted)",
          };

  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={palette}
    >
      {label}
    </span>
  );
}

export function PairHeaderHero({ pair }: Props) {
  const { reference: usdReference, loading: usdLoading } = useQuoteAssetUsdReference(
    pair.quoteAsset
  );
  const status = formatPairStatus(pair.curve.status);
  const circulatingSupply =
    pair.curve.totalSupply > pair.curve.currentCurveInventory
      ? pair.curve.totalSupply - pair.curve.currentCurveInventory
      : 0n;
  const marketCap =
    (pair.curve.currentPrice * pair.curve.totalSupply) /
    1_000_000_000_000_000_000n;
  const nativePriceLabel = formatMarketPrice(
    pair.curve.currentPrice,
    pair.quoteAsset,
    pair.token.decimals
  );
  const nativeMarketCapLabel = formatQuoteAmountSummary(marketCap, pair.quoteAsset);
  const priceUsd = marketPriceToUsd(
    pair.curve.currentPrice,
    pair.quoteAsset,
    pair.token.decimals,
    usdReference?.priceUsd ?? null
  );
  const marketCapUsd = quoteAmountToUsd(
    marketCap,
    pair.quoteAsset,
    usdReference?.priceUsd ?? null
  );
  const usdProviderLabel = usdLoading
    ? "USD ref: loading..."
    : usdReference
      ? `USD ref: ${usdReference.provider}`
      : "USD ref unavailable";

  return (
    <section
      className="rounded-[28px] p-6"
      style={{
        background:
          "linear-gradient(180deg, rgba(12, 18, 31, 0.9), rgba(12, 18, 31, 0.72))",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge label="BondingCurve" tone="muted" />
              {pair.curve.launchProfile && (
                <Badge
                  label={`${getLaunchProfileDefinition(pair.curve.launchProfile).label} profile`}
                  tone="muted"
                />
              )}
              <Badge
                label={status}
                tone={pair.curve.graduationReady ? "success" : "accent"}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "var(--forge-text-muted)",
              }}
            >
              Share
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "var(--forge-text-muted)",
              }}
            >
              Watch
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <h1
              className="text-3xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {pair.pairLabel}
            </h1>
            <p className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
              {pair.token.name || pair.token.symbol}
            </p>
          </div>
          <div
            className="flex flex-wrap items-center gap-3 text-sm"
            style={{ color: "var(--forge-text-muted)" }}
          >
            <span>Created {formatRelativeCreatedAt(pair.curve.createdAt)}</span>
            <span>Quote asset: {pair.quoteAsset}</span>
            <span>Canonical market</span>
            <span>{usdProviderLabel}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Price
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {priceUsd !== null ? formatUsdPrice(priceUsd) : nativePriceLabel}
            </p>
            {priceUsd !== null && (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--forge-text-muted)" }}
              >
                {nativePriceLabel}
              </p>
            )}
            {priceUsd === null && usdLoading && (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--forge-text-muted)" }}
              >
                Waiting for USD reference...
              </p>
            )}
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Real Quote
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {formatQuoteAmount(pair.curve.realQuote, pair.quoteAsset)}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Market Cap
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {marketCapUsd !== null
                ? formatUsdCompactAmount(marketCapUsd)
                : nativeMarketCapLabel}
            </p>
            {marketCapUsd !== null && (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--forge-text-muted)" }}
              >
                {nativeMarketCapLabel}
              </p>
            )}
            {marketCapUsd === null && usdLoading && (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--forge-text-muted)" }}
              >
                Waiting for USD reference...
              </p>
            )}
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Circulating
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {formatTokenDisplayRounded(
                circulatingSupply,
                pair.token.decimals,
                pair.token.symbol
              )}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Trades
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {pair.curve.totalTrades.toLocaleString("en-US")}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Curve Inventory
            </p>
            <p
              className="mt-2 text-xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {formatTokenDisplayRounded(
                pair.curve.currentCurveInventory,
                pair.token.decimals,
                pair.token.symbol
              )}
            </p>
            <p
              className="mt-2 text-xs leading-relaxed"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Tokens currently still held by the bonding curve.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
