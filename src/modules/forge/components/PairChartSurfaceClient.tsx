"use client";

interface Props {
  pairLabel: string;
  enabled: boolean;
}

export function PairChartSurfaceClient({ pairLabel, enabled }: Props) {
  return (
    <div
      className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] px-6 py-10 text-center"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <p
        className="text-xs uppercase tracking-[0.24em]"
        style={{ color: "var(--forge-text-muted)" }}
      >
        Chart
      </p>
      <h3
        className="mt-3 text-2xl font-semibold"
        style={{ color: "var(--forge-text-primary)" }}
      >
        {enabled ? pairLabel : "Available after indexer deployment"}
      </h3>
      <p
        className="mt-3 max-w-xl text-sm leading-relaxed"
        style={{ color: "var(--forge-text-muted)" }}
      >
        {enabled
          ? "The live chart surface is ready for indexed OHLC candles and richer overlays."
          : "FEAT-075 v1 keeps the chart panel visible, but historical candles wait for the FEAT-071 indexer cutover."}
      </p>
    </div>
  );
}
