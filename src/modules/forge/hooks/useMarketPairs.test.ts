import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketPairs } from "./useMarketPairs";

vi.mock("../market-data-service", () => ({
  BASELINE_MARKET_ENHANCEMENT_CAPABILITIES: {
    mode: "baseline",
    marketList: false,
    trendData: false,
    candles: false,
    tradeHistory: false,
    holders: false,
    topTraders: false,
    liveFeed: false,
    contractChangeFeed: true,
  },
  listBaselineMarketPairs: vi.fn(),
  listBaselineTrendingMarkets: vi.fn(),
}));

import {
  listBaselineMarketPairs,
  listBaselineTrendingMarkets,
} from "../market-data-service";

describe("useMarketPairs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads pairs and trending pairs", async () => {
    vi.mocked(listBaselineMarketPairs).mockResolvedValue([
      { pairHash: "0x1", pairLabel: "AAA/GAS" } as never,
    ]);
    vi.mocked(listBaselineTrendingMarkets).mockResolvedValue([
      { pairHash: "0x1", pairLabel: "AAA/GAS" } as never,
    ]);

    const { result } = renderHook(() => useMarketPairs("aaa"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.pairs).toHaveLength(1);
    expect(result.current.trendingPairs).toHaveLength(1);
    expect(vi.mocked(listBaselineMarketPairs)).toHaveBeenCalledWith("aaa");
    expect(vi.mocked(listBaselineTrendingMarkets)).toHaveBeenCalledWith(5);
  });

  it("captures service failures", async () => {
    vi.mocked(listBaselineMarketPairs).mockRejectedValue(new Error("rpc failed"));
    vi.mocked(listBaselineTrendingMarkets).mockResolvedValue([]);

    const { result } = renderHook(() => useMarketPairs());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pairs).toEqual([]);
    expect(result.current.trendingPairs).toEqual([]);
    expect(result.current.error).toContain("rpc failed");
  });
});
