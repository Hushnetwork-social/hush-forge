"use client";

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import type { CurvePreviewMetric } from "../market-curve-preview";
import { marketPriceToNumber, quoteAmountToNumber } from "../market-formatting";
import type { MarketCandle, MarketPairReadModel } from "../types";

const CHART_HEIGHT = 320;
const MIN_VISIBLE_BARS = 12;
const MAX_VISIBLE_BARS = 18;
const RIGHT_OFFSET_BARS = 1.5;
const DEFAULT_BAR_SPACING = 18;

interface Props {
  pair: MarketPairReadModel;
  candles: MarketCandle[];
  metric: CurvePreviewMetric;
}

function resolvePrecision(values: number[]): number {
  const positiveValues = values.filter(
    (value) => Number.isFinite(value) && value > 0
  );
  if (positiveValues.length === 0) {
    return 2;
  }

  const minValue = Math.min(...positiveValues);
  const maxValue = Math.max(...positiveValues);

  if (maxValue >= 1_000) {
    return 2;
  }

  if (maxValue >= 1) {
    return 4;
  }

  const leadingZeroCount = Math.max(0, Math.floor(-Math.log10(minValue)));
  return Math.min(Math.max(leadingZeroCount + 4, 4), 10);
}

export function OnChainMarketChart({ pair, candles, metric }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) {
      return;
    }

    let destroyed = false;
    let cleanupResize: (() => void) | undefined;
    let removeChart: (() => void) | undefined;

    void import("lightweight-charts").then(
      ({
        AreaSeries,
        CandlestickSeries,
        createChart,
        ColorType,
      }) => {
        if (destroyed || !containerRef.current) {
          return;
        }

        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: CHART_HEIGHT,
          layout: {
            background: {
              type: ColorType.Solid,
              color: "rgba(0,0,0,0)",
            },
            textColor: "#8c95b0",
            fontFamily: "inherit",
            attributionLogo: true,
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.06)" },
          },
          rightPriceScale: {
            borderColor: "rgba(255,255,255,0.08)",
          },
          timeScale: {
            borderColor: "rgba(255,255,255,0.08)",
            timeVisible: true,
            secondsVisible: false,
            rightOffset: RIGHT_OFFSET_BARS,
            barSpacing: DEFAULT_BAR_SPACING,
            minBarSpacing: 10,
            maxBarSpacing: 24,
          },
          crosshair: {
            vertLine: {
              color: "rgba(255,107,53,0.2)",
            },
            horzLine: {
              color: "rgba(255,255,255,0.14)",
            },
          },
        });

        const priceSeriesData = candles
          .map((candle) => {
            const open = marketPriceToNumber(
              candle.open,
              pair.quoteAsset,
              pair.token.decimals
            );
            const high = marketPriceToNumber(
              candle.high,
              pair.quoteAsset,
              pair.token.decimals
            );
            const low = marketPriceToNumber(
              candle.low,
              pair.quoteAsset,
              pair.token.decimals
            );
            const close = marketPriceToNumber(
              candle.close,
              pair.quoteAsset,
              pair.token.decimals
            );

            if (
              open === null ||
              high === null ||
              low === null ||
              close === null
            ) {
              return null;
            }

            return {
              time: candle.time as UTCTimestamp,
              open,
              high,
              low,
              close,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null);
        const marketCapSeriesData = candles
          .map((candle) => {
            const marketCap =
              (candle.close * pair.curve.totalSupply) /
              1_000_000_000_000_000_000n;
            const value = quoteAmountToNumber(marketCap, pair.quoteAsset);
            if (value === null) {
              return null;
            }

            return {
              time: candle.time as UTCTimestamp,
              value,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null);
        const pricePrecision = resolvePrecision(
          priceSeriesData.flatMap((candle) => [
            candle.open,
            candle.high,
            candle.low,
            candle.close,
          ])
        );
        const marketCapPrecision = resolvePrecision(
          marketCapSeriesData.map((candle) => candle.value)
        );

        if (metric === "price") {
          const series = chart.addSeries(CandlestickSeries, {
            upColor: "#20c997",
            downColor: "#ff5c5c",
            wickUpColor: "#34d8aa",
            wickDownColor: "#ff7a7a",
            borderUpColor: "#20c997",
            borderDownColor: "#ff5c5c",
            priceLineVisible: false,
            lastValueVisible: true,
            priceFormat: {
              type: "price",
              precision: pricePrecision,
              minMove: 1 / 10 ** pricePrecision,
            },
          });

          series.setData(priceSeriesData);
        } else {
          const series = chart.addSeries(AreaSeries, {
            lineColor: "#ff6b35",
            topColor: "rgba(255,107,53,0.28)",
            bottomColor: "rgba(255,107,53,0.02)",
            priceLineVisible: false,
            lastValueVisible: true,
            priceFormat: {
              type: "price",
              precision: marketCapPrecision,
              minMove: 1 / 10 ** marketCapPrecision,
            },
          });

          series.setData(marketCapSeriesData);
        }

        const latestLogicalIndex = Math.max(candles.length - 1, 0);
        const visibleBars = Math.min(
          Math.max(MIN_VISIBLE_BARS, candles.length + 3),
          MAX_VISIBLE_BARS
        );
        chart.timeScale().setVisibleLogicalRange({
          from: latestLogicalIndex + RIGHT_OFFSET_BARS - visibleBars,
          to: latestLogicalIndex + RIGHT_OFFSET_BARS,
        });

        if (typeof ResizeObserver !== "undefined") {
          const resizeObserver = new ResizeObserver(() => {
            if (!containerRef.current) {
              return;
            }

            chart.applyOptions({
              width: containerRef.current.clientWidth,
            });
          });

          resizeObserver.observe(containerRef.current);
          cleanupResize = () => resizeObserver.disconnect();
        }

        removeChart = () => chart.remove();
      }
    );

    return () => {
      destroyed = true;
      cleanupResize?.();
      removeChart?.();
    };
  }, [
    candles,
    metric,
    pair.curve.totalSupply,
    pair.quoteAsset,
    pair.token.decimals,
  ]);

  return (
    <div
      ref={containerRef}
      className="h-[320px] w-full"
      aria-label={`${pair.pairLabel} on-chain market preview`}
    />
  );
}
