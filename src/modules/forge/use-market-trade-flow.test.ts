import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketTradeFlow } from "./use-market-trade-flow";
import type {
  MarketBuyQuote,
  MarketPairReadModel,
  MarketSellQuote,
} from "./types";

vi.mock("./forge-config", () => ({
  GAS_CONTRACT_HASH: "0xd2a4cff31913016155e38e474a2c06d08be276cf",
  getRuntimeBondingCurveRouterHash: vi.fn(),
}));

vi.mock("./neo-rpc-client", () => ({
  getBondingCurveBuyQuote: vi.fn(),
  getBondingCurveSellQuote: vi.fn(),
  getTokenBalance: vi.fn(),
}));

vi.mock("./neo-dapi-adapter", () => ({
  invokeBondingCurveBuy: vi.fn(),
  invokeBondingCurveSell: vi.fn(),
}));

import { getRuntimeBondingCurveRouterHash } from "./forge-config";
import {
  getBondingCurveBuyQuote,
  getBondingCurveSellQuote,
  getTokenBalance,
} from "./neo-rpc-client";
import {
  invokeBondingCurveBuy,
  invokeBondingCurveSell,
} from "./neo-dapi-adapter";

const TOKEN_FACTOR = 100_000_000n;

const samplePair: MarketPairReadModel = {
  pairHash: "0xtoken1",
  tokenHash: "0xtoken1",
  pairLabel: "HUSHDOG/GAS",
  token: {
    contractHash: "0xtoken1",
    symbol: "HUSHDOG",
    name: "Hush Dog",
    creator: "Ncreator111111111111111111",
    supply: 100_000n * TOKEN_FACTOR,
    decimals: 8,
    mode: "speculative",
    tier: 1,
    createdAt: 1_234_567,
  },
  quoteAsset: "GAS",
  marketType: "BondingCurve",
  curve: {
    tokenHash: "0xtoken1",
    contractStatus: "Active",
    status: "active",
    quoteAsset: "GAS",
    virtualQuote: 150_00000000n,
    realQuote: 40_00000000n,
    currentCurveInventory: 70_000n * TOKEN_FACTOR,
    invariantK: 1n,
    graduationThreshold: 60_00000000n,
    graduationReady: false,
    currentPrice: 100_000n,
    totalTrades: 42n,
    createdAt: 1_234_567,
    curveInventory: 80_000n * TOKEN_FACTOR,
    retainedInventory: 20_000n * TOKEN_FACTOR,
    totalSupply: 100_000n * TOKEN_FACTOR,
  },
  graduation: {
    tokenHash: "0xtoken1",
    realQuote: 40_00000000n,
    graduationThreshold: 60_00000000n,
    progressBps: 6667,
    graduationReady: false,
  },
  capabilities: {
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
};

const sampleBuyQuote: MarketBuyQuote = {
  tokenHash: "0xtoken1",
  grossQuoteIn: 125_000_000n,
  quoteConsumed: 125_000_000n,
  quoteRefund: 25_000_000n,
  grossTokenOut: 100n * TOKEN_FACTOR,
  burnAmount: 2n * TOKEN_FACTOR,
  netTokenOut: 98n * TOKEN_FACTOR,
  platformFee: 0n,
  creatorFee: 0n,
  nextPrice: 125_000n,
  capped: true,
};

const sampleSellQuote: MarketSellQuote = {
  tokenHash: "0xtoken1",
  grossTokenIn: 10n * TOKEN_FACTOR,
  burnAmount: 1n * TOKEN_FACTOR,
  netTokenIn: 9n * TOKEN_FACTOR,
  grossQuoteOut: 15_000_000n,
  netQuoteOut: 15_000_000n,
  platformFee: 1_000_000n,
  creatorFee: 500_000n,
  nextPrice: 90_000n,
  liquidityOkay: true,
};

describe("useMarketTradeFlow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getRuntimeBondingCurveRouterHash).mockReturnValue("0xrouter");
    vi.mocked(getTokenBalance)
      .mockResolvedValueOnce(2_000_000_000n)
      .mockResolvedValueOnce(250n * TOKEN_FACTOR);
  });

  it("loads buy preview data, surfaces capped refunds, and requires acknowledgement for >15% impact", async () => {
    vi.mocked(getBondingCurveBuyQuote).mockResolvedValue(sampleBuyQuote);

    const { result } = renderHook(() =>
      useMarketTradeFlow(samplePair, "Nwallet11111111111111111111111111111111", 10_000_000n)
    );

    act(() => {
      result.current.setAmountInput("1.25");
    });

    await waitFor(() => expect(result.current.quote).not.toBeNull());

    expect(result.current.minimumOutput).toBe(97_02000000n);
    expect(result.current.requiresImpactAcknowledgement).toBe(true);
    expect(result.current.canSubmit).toBe(false);

    act(() => {
      result.current.setImpactAcknowledged(true);
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));
  });

  it("submits a buy using the router transfer flow and exposes the tx hash", async () => {
    vi.mocked(getBondingCurveBuyQuote).mockResolvedValue({
      ...sampleBuyQuote,
      quoteRefund: 0n,
      burnAmount: 0n,
      netTokenOut: 100n * TOKEN_FACTOR,
      nextPrice: 102_000n,
      capped: false,
    });
    vi.mocked(invokeBondingCurveBuy).mockResolvedValue("0xbuytx");

    const { result } = renderHook(() =>
      useMarketTradeFlow(samplePair, "Nwallet11111111111111111111111111111111", 10_000_000n)
    );

    act(() => {
      result.current.setAmountInput("1.25");
    });

    await waitFor(() => expect(result.current.quote).not.toBeNull());
    act(() => {
      result.current.setImpactAcknowledged(true);
    });

    act(() => {
      void result.current.submit();
    });

    await waitFor(() =>
      expect(invokeBondingCurveBuy).toHaveBeenCalledWith(
        "0xrouter",
        "0xtoken1",
        "GAS",
        125_000_000n,
        99n * TOKEN_FACTOR
      )
    );
    expect(result.current.submittedTxHash).toBe("0xbuytx");
  });

  it("opens a liquidity failure state for sells that exceed available quote reserve", async () => {
    vi.mocked(getTokenBalance)
      .mockResolvedValueOnce(2_000_000_000n)
      .mockResolvedValueOnce(250n * TOKEN_FACTOR);
    vi.mocked(getBondingCurveSellQuote).mockResolvedValue({
      ...sampleSellQuote,
      liquidityOkay: false,
    });

    const { result } = renderHook(() =>
      useMarketTradeFlow(samplePair, "Nwallet11111111111111111111111111111111", 10_000_000n)
    );

    act(() => {
      result.current.setSide("sell");
      result.current.setAmountInput("10");
    });

    await waitFor(() => expect(result.current.quote).not.toBeNull());

    expect(result.current.canSubmit).toBe(false);

    act(() => {
      void result.current.submit();
    });

    await waitFor(() => expect(result.current.failure?.reason).toBe("liquidity"));
    expect(invokeBondingCurveSell).not.toHaveBeenCalled();
  });
});
