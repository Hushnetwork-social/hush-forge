"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CurvePreviewMetric } from "../market-curve-preview";
import type { MarketActivitySnapshot, MarketPairReadModel } from "../types";

const PairChartSurfaceClient = dynamic(
  () =>
    import("./PairChartSurfaceClient").then((module) => ({
      default: module.PairChartSurfaceClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="Loading chart panel"
        className="min-h-[320px] animate-pulse rounded-[24px]"
        style={{ background: "rgba(255,255,255,0.04)" }}
      />
    ),
  }
);

interface Props {
  pair: MarketPairReadModel;
  activity: MarketActivitySnapshot | null;
  activityLoading: boolean;
  activityError: string | null;
}

type ChartSurfaceMode = "curve" | "onchain";

export function PairChartPanel({
  pair,
  activity,
  activityLoading,
  activityError,
}: Props) {
  const [metric, setMetric] = useState<CurvePreviewMetric>("price");
  const [surfaceMode, setSurfaceMode] = useState<ChartSurfaceMode>("onchain");

  return (
    <section
      className="rounded-[28px] p-6"
      style={{
        background: "rgba(12, 18, 31, 0.82)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSurfaceMode("curve")}
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            style={{
              background:
                surfaceMode === "curve"
                  ? "rgba(255,107,53,0.14)"
                  : "rgba(255,255,255,0.04)",
              color:
                surfaceMode === "curve"
                  ? "var(--forge-color-primary)"
                  : "var(--forge-text-muted)",
            }}
          >
            Live curve
          </button>
          <button
            type="button"
            onClick={() => setSurfaceMode("onchain")}
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            style={{
              background:
                surfaceMode === "onchain"
                  ? "rgba(255,107,53,0.14)"
                  : "rgba(255,255,255,0.04)",
              color:
                surfaceMode === "onchain"
                  ? "var(--forge-color-primary)"
                  : "var(--forge-text-muted)",
            }}
          >
            On-chain preview
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            onClick={() => setMetric("price")}
            style={{
              background:
                metric === "price"
                  ? "rgba(255,107,53,0.14)"
                  : "rgba(255,255,255,0.04)",
              color:
                metric === "price"
                  ? "var(--forge-color-primary)"
                  : "var(--forge-text-muted)",
            }}
          >
            Price
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            onClick={() => setMetric("market-cap")}
            style={{
              background:
                metric === "market-cap"
                  ? "rgba(255,107,53,0.14)"
                  : "rgba(255,255,255,0.04)",
              color:
                metric === "market-cap"
                  ? "var(--forge-color-primary)"
                  : "var(--forge-text-muted)",
            }}
          >
            Price / FDV
          </button>
        </div>
      </div>

      <div className="mt-4">
        <PairChartSurfaceClient
          pair={pair}
          mode={surfaceMode}
          metric={metric}
          activity={activity}
          activityLoading={activityLoading}
          activityError={activityError}
        />
      </div>
    </section>
  );
}
