"use client";

import Link from "next/link";
import {
  formatPairStatus,
  formatProgressPercent,
  formatQuoteAmount,
  formatRelativeCreatedAt,
} from "../market-formatting";
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
  const status = formatPairStatus(pair.curve.status);
  const progress = formatProgressPercent(pair.graduation.progressBps);

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
          <div className="flex items-center gap-3">
            <Link
              href="/markets"
              className="text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Back to Pairs
            </Link>
            <div className="flex flex-wrap gap-2">
              <Badge label="BondingCurve" tone="muted" />
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
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--forge-text-muted)" }}>
              Price
            </p>
            <p className="mt-2 text-xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              {formatQuoteAmount(pair.curve.currentPrice, pair.quoteAsset)}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--forge-text-muted)" }}>
              Real Quote
            </p>
            <p className="mt-2 text-xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              {formatQuoteAmount(pair.curve.realQuote, pair.quoteAsset)}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--forge-text-muted)" }}>
              Virtual Quote
            </p>
            <p className="mt-2 text-xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              {formatQuoteAmount(pair.curve.virtualQuote, pair.quoteAsset)}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--forge-text-muted)" }}>
              Trades
            </p>
            <p className="mt-2 text-xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              {pair.curve.totalTrades.toLocaleString("en-US")}
            </p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--forge-text-muted)" }}>
              Progress
            </p>
            <p className="mt-2 text-xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              {progress}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
