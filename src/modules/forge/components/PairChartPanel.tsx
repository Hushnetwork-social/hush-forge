"use client";

import dynamic from "next/dynamic";

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
  pairLabel: string;
  candlesEnabled: boolean;
}

export function PairChartPanel({ pairLabel, candlesEnabled }: Props) {
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
          {["1m", "5m", "15m", "1h", "1d"].map((interval, index) => (
            <button
              key={interval}
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-medium"
              style={{
                background: index === 2
                  ? "rgba(255,107,53,0.14)"
                  : "rgba(255,255,255,0.04)",
                color: index === 2
                  ? "var(--forge-color-primary)"
                  : "var(--forge-text-muted)",
              }}
            >
              {interval}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            style={{
              background: "rgba(255,107,53,0.14)",
              color: "var(--forge-color-primary)",
            }}
          >
            Price
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-medium"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "var(--forge-text-muted)",
            }}
          >
            Price / MCap
          </button>
        </div>
      </div>

      <div className="mt-4">
        <PairChartSurfaceClient
          pairLabel={pairLabel}
          enabled={candlesEnabled}
        />
      </div>
    </section>
  );
}
