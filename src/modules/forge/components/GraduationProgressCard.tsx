"use client";

import {
  formatProgressPercent,
  formatQuoteAmount,
} from "../market-formatting";
import type { MarketPairReadModel } from "../types";

interface Props {
  pair: MarketPairReadModel;
}

function truncateCreator(value: string | null): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function GraduationProgressCard({ pair }: Props) {
  const progressBps = Math.min(pair.graduation.progressBps, 10_000);
  const isReady = pair.graduation.graduationReady;

  return (
    <section
      className="rounded-[28px] p-6"
      style={{
        background: "rgba(12, 18, 31, 0.82)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className="text-xs uppercase tracking-[0.24em]"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Graduation
          </p>
          <h2
            className="mt-2 text-2xl font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {isReady ? "Graduation Ready" : "Curve progress"}
          </h2>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            background: isReady
              ? "rgba(32,201,151,0.14)"
              : "rgba(255,107,53,0.14)",
            color: isReady ? "#20c997" : "var(--forge-color-primary)",
          }}
        >
          {formatProgressPercent(pair.graduation.progressBps)}
        </span>
      </div>

      <div
        className="mt-5 h-3 overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progressBps / 100}%`,
            background: isReady
              ? "linear-gradient(90deg, #20c997, #9be15d)"
              : "linear-gradient(90deg, var(--forge-color-primary), var(--forge-color-secondary))",
          }}
        />
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
            Current reserve
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {formatQuoteAmount(pair.graduation.realQuote, pair.quoteAsset)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
            Graduation threshold
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {formatQuoteAmount(pair.graduation.graduationThreshold, pair.quoteAsset)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
            Creator
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {truncateCreator(pair.token.creator)}
          </span>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
        {isReady
          ? "Threshold reached. Trading stays active on the bonding curve until a later migration exists and is executed on-chain."
          : "Trading stays on the curve in v1. This card shows the direct FEAT-074 reserve milestone, not a migration trigger."}
      </p>
    </section>
  );
}
