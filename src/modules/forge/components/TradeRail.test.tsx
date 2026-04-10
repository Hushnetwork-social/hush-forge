import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeRail } from "./TradeRail";
import type { MarketBuyQuote, MarketPairReadModel } from "../types";

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
    virtualTokens: 10_000n * TOKEN_FACTOR,
    realQuote: 40_00000000n,
    currentCurveInventory: 70_000n * TOKEN_FACTOR,
    invariantK: (190_00000000n) * (80_000n * TOKEN_FACTOR),
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

function makeBuyQuote(overrides: Partial<MarketBuyQuote> = {}): MarketBuyQuote {
  return {
    tokenHash: "0xtoken1",
    grossQuoteIn: 1_00000000n,
    quoteConsumed: 1_00000000n,
    quoteRefund: 0n,
    grossTokenOut: 550n * TOKEN_FACTOR,
    burnAmount: 0n,
    netTokenOut: 550n * TOKEN_FACTOR,
    platformFee: 0n,
    creatorFee: 0n,
    nextPrice: 120_000n,
    capped: false,
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

  it("rounds the quote balance label to keep the rail compact", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        quoteBalance: 999_797_70734719n,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.getByText("Balance: 999,797.71 GAS")).toBeInTheDocument();
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

  it("shows an exact-fill message when a capped buy has no refund", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        quote: makeBuyQuote({
          grossQuoteIn: 10_00000000n,
          quoteConsumed: 10_00000000n,
          quoteRefund: 0n,
          grossTokenOut: 100_000n * TOKEN_FACTOR,
          netTokenOut: 100_000n * TOKEN_FACTOR,
          capped: true,
        }),
        minimumOutput: 99_000n * TOKEN_FACTOR,
        priceImpactBps: 9_999,
        priceImpactLabel: "99.99%",
        impactTone: "danger",
        requiresImpactAcknowledgement: true,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(
      screen.getByText("This buy exactly fills the remaining curve inventory.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Excess GAS will be refunded after execution/i)
    ).not.toBeInTheDocument();
  });

  it("shows the refund message when a capped buy leaves excess quote to refund", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        quote: makeBuyQuote({
          grossQuoteIn: 11_00000000n,
          quoteConsumed: 10_00000000n,
          quoteRefund: 1_00000000n,
          grossTokenOut: 100_000n * TOKEN_FACTOR,
          netTokenOut: 100_000n * TOKEN_FACTOR,
          capped: true,
        }),
        minimumOutput: 99_000n * TOKEN_FACTOR,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Excess GAS will be refunded after execution/i)
    ).toBeInTheDocument();
  });

  it("keeps the price-impact banner hidden for warning-only previews", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        amountInput: "300",
        quote: makeBuyQuote({
          grossQuoteIn: 300_00000000n,
          quoteConsumed: 300_00000000n,
          netTokenOut: 61_701_745_81000000n,
        }),
        minimumOutput: 61_084_728_35000000n,
        priceImpactBps: 578,
        priceImpactLabel: "5.78%",
        impactTone: "warning",
        requiresImpactAcknowledgement: false,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.getByText("Price impact")).toBeInTheDocument();
    expect(screen.getByText("5.78%")).toBeInTheDocument();
    expect(
      screen.queryByText(/This trade needs explicit acknowledgement before signature/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/I understand this trade has more than 15% price impact/i)
    ).not.toBeInTheDocument();
  });

  it("rounds buy-side preview token amounts to two decimals", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        amountInput: "100",
        quote: makeBuyQuote({
          grossQuoteIn: 100_00000000n,
          quoteConsumed: 100_00000000n,
          netTokenOut: 21_797_666_36748305n,
        }),
        minimumOutput: 21_579_689_70380821n,
        priceImpactBps: 194,
        priceImpactLabel: "1.94%",
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.getByText("21,797,666.37 HUSHDOG")).toBeInTheDocument();
    expect(screen.getByText("21,579,689.70 HUSHDOG")).toBeInTheDocument();
  });

  it("shows the TokenOwner fee and total wallet outflow on buy previews", () => {
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        amountInput: "1",
        quote: makeBuyQuote({
          grossQuoteIn: 1_00000000n,
          creatorFee: 5_000_000n,
          platformFee: 1_000_000n,
        }),
        minimumOutput: 540n * TOKEN_FACTOR,
        requiredGasFee: 6_000_000n,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.getByText("TokenOwner fee")).toBeInTheDocument();
    expect(screen.getByText("0.05 GAS")).toBeInTheDocument();
    expect(screen.getByText("Platform fee")).toBeInTheDocument();
    expect(screen.getByText("0.01 GAS")).toBeInTheDocument();
    expect(screen.getByText("Total wallet outflow")).toBeInTheDocument();
    expect(screen.getByText("1.06 GAS")).toBeInTheDocument();
  });

  it("keeps slippage controls behind advanced settings and applies preset choices", () => {
    const setSlippageInput = vi.fn();
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        slippageInput: "1",
        setSlippageInput,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Custom slippage")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/i }));

    expect(screen.getByRole("button", { name: "1%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5%" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "3%" }));

    expect(setSlippageInput).toHaveBeenCalledWith("3");
  });

  it("reveals the custom slippage input when custom mode is selected", () => {
    const setSlippageInput = vi.fn();
    vi.mocked(useMarketTradeFlow).mockReturnValue(
      makeHookResult({
        slippageInput: "1",
        setSlippageInput,
      })
    );

    render(
      <TradeRail
        pair={samplePair}
        connectedAddress={"Nwallet11111111111111111111111111111111"}
        connectionStatus="connected"
        gasBalance={0n}
        onConnectClick={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/i }));
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    const input = screen.getByLabelText("Custom slippage");
    fireEvent.change(input, { target: { value: "2.5" } });

    expect(setSlippageInput).toHaveBeenCalledWith("2.5");
  });
});
