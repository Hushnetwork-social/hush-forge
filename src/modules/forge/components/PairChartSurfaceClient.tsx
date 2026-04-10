"use client";

import { OnChainMarketChart } from "./OnChainMarketChart";
import {
  buildCurvePreviewSeries,
  type CurvePreviewMetric,
} from "../market-curve-preview";
import {
  formatMarketPrice,
  formatQuoteAmountSummary,
  marketPriceToNumber,
  quoteAmountToNumber,
} from "../market-formatting";
import type { MarketActivitySnapshot, MarketPairReadModel } from "../types";

interface Props {
  pair: MarketPairReadModel;
  mode: "curve" | "onchain";
  metric: CurvePreviewMetric;
  activity: MarketActivitySnapshot | null;
  activityLoading: boolean;
  activityError: string | null;
}

interface PlotPoint {
  x: number;
  y: number;
}

function buildPath(points: PlotPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function scaleY(
  value: number,
  minValue: number,
  maxValue: number,
  top: number,
  height: number
): number {
  const range = maxValue - minValue;
  if (range <= 0) {
    return top + height / 2;
  }
  return top + height - ((value - minValue) / range) * height;
}

function markerColor(label: "current" | "graduation" | "launch"): string {
  if (label === "current") return "var(--forge-color-primary)";
  if (label === "graduation") return "#20c997";
  return "rgba(255,255,255,0.45)";
}

export function PairChartSurfaceClient({
  pair,
  mode,
  metric,
  activity,
  activityLoading,
  activityError,
}: Props) {
  if (mode === "onchain") {
    const latestCandle = activity?.candles.at(-1) ?? null;

    return (
      <div
        className="rounded-[24px] px-5 py-5"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className="text-xs uppercase tracking-[0.24em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              On-chain preview
            </p>
            <h3
              className="mt-3 text-2xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              15m market preview
            </h3>
          </div>

          <div className="text-right text-xs" style={{ color: "var(--forge-text-muted)" }}>
            <p>TradingView Lightweight Charts</p>
            <p className="mt-1">
              {activity
                ? `Indexed through block ${activity.indexedThroughBlock.toLocaleString("en-US")}`
                : "Waiting for first activity snapshot"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          {activityLoading && !activity ? (
            <div
              className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] px-6 py-10 text-center"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <p
                className="text-xs uppercase tracking-[0.24em]"
                style={{ color: "var(--forge-text-muted)" }}
              >
                On-chain preview
              </p>
              <h3
                className="mt-3 text-2xl font-semibold"
                style={{ color: "var(--forge-text-primary)" }}
              >
                Loading 15m candles
              </h3>
              <p
                className="mt-3 max-w-xl text-sm leading-relaxed"
                style={{ color: "var(--forge-text-muted)" }}
              >
                The server is replaying Trade events from the chain so the first on-chain
                preview can render.
              </p>
            </div>
          ) : activityError && !activity ? (
            <div
              role="alert"
              className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] px-6 py-10 text-center"
              style={{
                background: "rgba(255,82,82,0.08)",
                border: "1px solid rgba(255,82,82,0.18)",
              }}
            >
              <p
                className="text-xs uppercase tracking-[0.24em]"
                style={{ color: "var(--forge-error)" }}
              >
                On-chain preview
              </p>
              <h3
                className="mt-3 text-2xl font-semibold"
                style={{ color: "var(--forge-text-primary)" }}
              >
                Unable to load market replay
              </h3>
              <p
                className="mt-3 max-w-xl text-sm leading-relaxed"
                style={{ color: "var(--forge-text-muted)" }}
              >
                {activityError}
              </p>
            </div>
          ) : !activity || activity.candles.length === 0 ? (
            <div
              className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] px-6 py-10 text-center"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <p
                className="text-xs uppercase tracking-[0.24em]"
                style={{ color: "var(--forge-text-muted)" }}
              >
                On-chain preview
              </p>
              <h3
                className="mt-3 text-2xl font-semibold"
                style={{ color: "var(--forge-text-primary)" }}
              >
                No on-chain trades yet
              </h3>
              <p
                className="mt-3 max-w-xl text-sm leading-relaxed"
                style={{ color: "var(--forge-text-muted)" }}
              >
                15m candles appear after the first settled trade. The live curve view stays
                available immediately so the market launch is still understandable before
                activity begins.
              </p>
            </div>
          ) : (
            <OnChainMarketChart
              pair={pair}
              candles={activity.candles}
              metric={metric}
            />
          )}
        </div>

        <div
          className="mt-6 grid gap-4 border-t pt-4 sm:grid-cols-3"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div>
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Latest close
            </p>
            <p
              className="mt-2 text-base font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {latestCandle
                ? metric === "price"
                  ? formatMarketPrice(
                      latestCandle.close,
                      pair.quoteAsset,
                      pair.token.decimals
                    )
                  : formatQuoteAmountSummary(
                      (latestCandle.close * pair.curve.totalSupply) /
                        1_000_000_000_000_000_000n,
                      pair.quoteAsset
                    )
                : "-"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--forge-text-muted)" }}>
              {metric === "price"
                ? "Last 15m candle close"
                : "Last 15m fully diluted value close"}
            </p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              15m volume
            </p>
            <p
              className="mt-2 text-base font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {latestCandle
                ? formatQuoteAmountSummary(latestCandle.volume, pair.quoteAsset)
                : "-"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--forge-text-muted)" }}>
              Most recent candle volume
            </p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-[0.22em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Trades indexed
            </p>
            <p
              className="mt-2 text-base font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {(activity?.trades.length ?? 0).toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--forge-text-muted)" }}>
              Recent trades kept in the demo cache
            </p>
          </div>
        </div>
      </div>
    );
  }

  const preview = buildCurvePreviewSeries(pair.curve);
  const chartWidth = 760;
  const chartHeight = 280;
  const chartPadding = { top: 16, right: 16, bottom: 20, left: 16 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const xMax = Math.max(
    quoteAmountToNumber(preview.domainEndQuote, pair.quoteAsset) ?? 0,
    1
  );
  const plotSeries = preview.points.map((point, index) => {
    const reserveValue = quoteAmountToNumber(point.reserveQuote, pair.quoteAsset) ?? 0;
    const metricValue =
      metric === "price"
        ? marketPriceToNumber(point.price, pair.quoteAsset, pair.token.decimals) ?? 0
        : quoteAmountToNumber(point.marketCap, pair.quoteAsset) ?? 0;

    return {
      key: `${point.reserveQuote.toString()}-${index}`,
      x: chartPadding.left + (reserveValue / xMax) * plotWidth,
      yValue: metricValue,
    };
  });
  const yValues = plotSeries.map((point) => point.yValue);
  const rawMinY = yValues.length > 0 ? Math.min(...yValues) : 0;
  const rawMaxY = yValues.length > 0 ? Math.max(...yValues) : 1;
  const minY = rawMinY > 0 ? rawMinY * 0.92 : 0;
  const maxY = rawMaxY > 0 ? rawMaxY * 1.08 : 1;
  const linePoints = plotSeries.map<PlotPoint>((point) => ({
    x: point.x,
    y: scaleY(point.yValue, minY, maxY, chartPadding.top, plotHeight),
  }));
  const linePath = buildPath(linePoints);
  const areaPath = `${linePath} L ${chartPadding.left + plotWidth} ${chartPadding.top + plotHeight} L ${chartPadding.left} ${chartPadding.top + plotHeight} Z`;

  function toMarker(point: (typeof preview)["currentPoint"]): PlotPoint {
    const reserveValue = quoteAmountToNumber(point.reserveQuote, pair.quoteAsset) ?? 0;
    const metricValue =
      metric === "price"
        ? marketPriceToNumber(point.price, pair.quoteAsset, pair.token.decimals) ?? 0
        : quoteAmountToNumber(point.marketCap, pair.quoteAsset) ?? 0;

    return {
      x: chartPadding.left + (reserveValue / xMax) * plotWidth,
      y: scaleY(metricValue, minY, maxY, chartPadding.top, plotHeight),
    };
  }

  const launchMarker = toMarker(preview.launchPoint);
  const currentMarker = toMarker(preview.currentPoint);
  const graduationMarker = toMarker(preview.graduationPoint);
  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const y = chartPadding.top + plotHeight * ratio;
    return { key: `grid-${index}`, y };
  });

  function formatMetricValue(
    point:
      | (typeof preview)["launchPoint"]
      | (typeof preview)["currentPoint"]
      | (typeof preview)["graduationPoint"]
  ): string {
    return metric === "price"
      ? formatMarketPrice(point.price, pair.quoteAsset, pair.token.decimals)
      : formatQuoteAmountSummary(point.marketCap, pair.quoteAsset);
  }

  return (
    <div
      className="rounded-[24px] px-5 py-5"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            className="text-xs uppercase tracking-[0.24em]"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Curve preview
          </p>
          <h3
            className="mt-3 text-2xl font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            Live curve preview
          </h3>
          <p
            className="mt-3 max-w-2xl text-sm leading-relaxed"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Drawn from router reserve and inventory state so traders can see the live
            bonding-curve shape while the on-chain preview reconstructs slower 15m candles
            directly from settled trade activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2" style={{ color: "var(--forge-text-muted)" }}>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: markerColor("launch") }}
            />
            Launch
          </div>
          <div className="flex items-center gap-2" style={{ color: "var(--forge-text-muted)" }}>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: markerColor("current") }}
            />
            Current reserve
          </div>
          <div className="flex items-center gap-2" style={{ color: "var(--forge-text-muted)" }}>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: markerColor("graduation") }}
            />
            Graduation target
          </div>
        </div>
      </div>

      <div className="mt-6">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${pair.pairLabel} live bonding curve preview`}
        >
          <defs>
            <linearGradient id="forge-curve-fill" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,107,53,0.28)" />
              <stop offset="100%" stopColor="rgba(255,107,53,0.02)" />
            </linearGradient>
          </defs>

          {gridLines.map((line) => (
            <line
              key={line.key}
              x1={chartPadding.left}
              x2={chartPadding.left + plotWidth}
              y1={line.y}
              y2={line.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}

          <line
            x1={graduationMarker.x}
            x2={graduationMarker.x}
            y1={chartPadding.top}
            y2={chartPadding.top + plotHeight}
            stroke={markerColor("graduation")}
            strokeDasharray="5 6"
            strokeOpacity="0.55"
            strokeWidth="1.5"
          />
          <line
            x1={currentMarker.x}
            x2={currentMarker.x}
            y1={chartPadding.top}
            y2={chartPadding.top + plotHeight}
            stroke={markerColor("current")}
            strokeDasharray="5 6"
            strokeOpacity="0.65"
            strokeWidth="1.5"
          />

          <path d={areaPath} fill="url(#forge-curve-fill)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--forge-color-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {[
            { point: launchMarker, kind: "launch" as const, radius: 4 },
            { point: currentMarker, kind: "current" as const, radius: 6 },
            { point: graduationMarker, kind: "graduation" as const, radius: 5 },
          ].map(({ point, kind, radius }) => (
            <circle
              key={kind}
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={markerColor(kind)}
              stroke="rgba(12, 18, 31, 0.9)"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      <div
        className="mt-6 grid gap-4 border-t pt-4 sm:grid-cols-3"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {[
          {
            key: "launch",
            metricLabel: metric === "price" ? "Launch price" : "Launch FDV",
            value: formatMetricValue(preview.launchPoint),
            detail: `Launch reserve: 0 ${pair.quoteAsset}`,
          },
          {
            key: "current",
            metricLabel: metric === "price" ? "Current price" : "Current FDV",
            value: formatMetricValue(preview.currentPoint),
            detail: `Current reserve: ${formatQuoteAmountSummary(
              preview.currentPoint.reserveQuote,
              pair.quoteAsset
            )}`,
          },
          {
            key: "graduation",
            metricLabel:
              metric === "price"
                ? "Price at target reserve"
                : "FDV at target reserve",
            value: formatMetricValue(preview.graduationPoint),
            detail: `Target reserve: ${formatQuoteAmountSummary(
              preview.graduationPoint.reserveQuote,
              pair.quoteAsset
            )}`,
          },
        ].map((item) => (
          <div key={item.key}>
            <p
              className="text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              {item.metricLabel}
            </p>
            <p
              className="mt-1 text-base font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {item.value}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--forge-text-muted)" }}>
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
