import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeRail } from "./TradeRail";
import type { MarketPairReadModel } from "../types";

vi.mock("../use-market-trade-flow", () => ({
  useMarketTradeFlow: vi.fn(),
}));

import { useMarketTradeFlow } from "../use-market-trade-flow";

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

function makeHookResult(overrides: Partial<ReturnType<typeof useMarketTradeFlow>> = {}) {
  return {
    side: "buy" as const,
    setSide: vi.fn(),
    amountInput: "",
    setAmountInput: vi.fn(),
    slippageInput: "1",
    setSlippageInput: vi.fn(),
    buyPresets: ["0.1", "0.5", "1"] as const,
    sellPresets: [25, 50, 75, 100] as const,
    applyBuyPreset: vi.fn(),
    applySellPreset: vi.fn(),
    quote: null,
    quoteLoading: false,
    quoteError: null,
    previewStale: false,
    quoteBalance: 2_000_000_000n,
    tokenBalance: 250n * TOKEN_FACTOR,
    balancesLoading: false,
    validationError: null,
    canSubmit: true,
    submitting: false,
    submittedTxHash: null,
    completeSubmission: vi.fn(),
    submitError: null,
    failure: null,
    dismissFailure: vi.fn(),
    minimumOutput: null,
    requiredGasFee: 0n,
    priceImpactBps: null,
    priceImpactLabel: "-",
    impactTone: "none" as const,
    requiresImpactAcknowledgement: false,
    impactAcknowledged: false,
    setImpactAcknowledged: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

describe("TradeRail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses the connect CTA when no wallet is attached", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(makeHookResult({ canSubmit: false }));
    const onConnectClick = vi.fn();

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={null}
        connectionStatus="disconnected"
        gasBalance={0n}
        onConnectClick={onConnectClick}
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet to trade" }));

    expect(onConnectClick).toHaveBeenCalledTimes(1);
  });

  it("forwards a submitted tx hash into the pending flow callback", () => {
    const completeSubmission = vi.fn();
    const onTxSubmitted = vi.fn();
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        submittedTxHash: "0xsubmitted",
        completeSubmission,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={onTxSubmitted}
      />
    );

    expect(onTxSubmitted).toHaveBeenCalledWith(
      "0xsubmitted",
      "Waiting for HUSHDOG/GAS buy confirmation..."
    );
    expect(completeSubmission).toHaveBeenCalledTimes(1);
  });
});
