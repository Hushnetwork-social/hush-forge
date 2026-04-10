import { describe, expect, it } from "vitest";
import {
  buildCurvePreviewPoint,
  buildCurvePreviewSeries,
} from "./market-curve-preview";
import type { MarketCurveState } from "./types";

const consistentCurve: MarketCurveState = {
  tokenHash: "0xtoken",
  contractStatus: "Active",
  status: "active",
  quoteAsset: "GAS",
  launchProfile: "growth",
  virtualQuote: 100_000_000n,
  virtualTokens: 250_000n,
  realQuote: 25_000_000n,
  currentCurveInventory: 750_000n,
  invariantK: 125_000_000_000_000n,
  graduationThreshold: 50_000_000n,
  graduationReady: false,
  currentPrice: 125_000_000_000_000_000_000n,
  totalTrades: 4n,
  createdAt: 1_710_000_000,
  curveInventory: 900_000n,
  retainedInventory: 100_000n,
  totalSupply: 1_000_000n,
};

describe("market-curve-preview", () => {
  it("builds a live preview series anchored to launch, current reserve, and graduation", () => {
    const preview = buildCurvePreviewSeries(consistentCurve, 12);

    expect(preview.points).toHaveLength(12);
    expect(preview.launchPoint.reserveQuote).toBe(0n);
    expect(preview.currentPoint.reserveQuote).toBe(25_000_000n);
    expect(preview.currentPoint.tokenReserve).toBe(750_000n);
    expect(preview.graduationPoint.reserveQuote).toBe(50_000_000n);
    expect(preview.graduationPoint.progressBps).toBe(10_000);
  });

  it("falls back to a state-derived invariant when fixtures carry a stale invariantK", () => {
    const point = buildCurvePreviewPoint(
      {
        ...consistentCurve,
        invariantK: 1n,
      },
      consistentCurve.realQuote
    );

    expect(point.tokenReserve).toBe(consistentCurve.currentCurveInventory);
  });
});
