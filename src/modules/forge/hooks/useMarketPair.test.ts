import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketPair } from "./useMarketPair";

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
  getBaselineMarketPair: vi.fn(),
}));

import { getBaselineMarketPair } from "../market-data-service";

describe("useMarketPair", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads the market pair read model", async () => {
    vi.mocked(getBaselineMarketPair).mockResolvedValue({
      pairHash: "0xpair",
      pairLabel: "PAIR/GAS",
    } as never);

    const { result } = renderHook(() => useMarketPair("0xpair"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.pair?.pairLabel).toBe("PAIR/GAS");
    expect(vi.mocked(getBaselineMarketPair)).toHaveBeenCalledWith("0xpair");
  });

  it("stays idle for an empty token hash", async () => {
    const { result } = renderHook(() => useMarketPair(""));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pair).toBeNull();
    expect(result.current.error).toBeNull();
    expect(vi.mocked(getBaselineMarketPair)).not.toHaveBeenCalled();
  });

  it("captures service failures", async () => {
    vi.mocked(getBaselineMarketPair).mockRejectedValue(new Error("curve missing"));

    const { result } = renderHook(() => useMarketPair("0xpair"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pair).toBeNull();
    expect(result.current.error).toContain("curve missing");
  });
});
