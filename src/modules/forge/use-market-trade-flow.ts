import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { getRuntimeBondingCurveRouterHash } from "./forge-config";
import {
  calculateExecutionPriceRaw,
  calculateMinimumOutput,
  calculatePriceImpactBps,
  formatAmountForInput,
  formatPriceImpactBps,
  getQuoteAssetContractHash,
  getSellPresetAmount,
  MARKET_TRADE_BUY_PRESETS,
  MARKET_TRADE_SELL_PRESETS,
  MARKET_TRADE_SLIPPAGE_STORAGE_KEY,
  parseSlippagePercentInput,
  parseTradeAmountInput,
  type MarketTradeSide,
} from "./market-trade-logic";
import { formatQuoteAmount, formatTokenDisplay } from "./market-formatting";
import {
  invokeBondingCurveBuy,
  invokeBondingCurveSell,
} from "./neo-dapi-adapter";
import {
  getBondingCurveBuyQuote,
  getBondingCurveSellQuote,
  getTokenBalance,
} from "./neo-rpc-client";
import { formatDatoshiAsGas } from "./token-economics-logic";
import type {
  MarketBuyQuote,
  MarketPairReadModel,
  MarketSellQuote,
} from "./types";
import { toUiErrorMessage } from "./components/error-utils";

type TradeQuote = MarketBuyQuote | MarketSellQuote;

type TradeValidationCode =
  | "invalid_amount"
  | "invalid_slippage"
  | "insufficient_quote_balance"
  | "insufficient_token_balance"
  | "insufficient_liquidity"
  | "insufficient_gas"
  | null;

export interface MarketTradeFailureState {
  reason:
    | "slippage"
    | "liquidity"
    | "quote_balance"
    | "token_balance"
    | "gas_balance"
    | "wallet_rejected"
    | "unknown";
  title: string;
  message: string;
  details: Array<{ label: string; value: string }>;
}

export interface UseMarketTradeFlowResult {
  side: MarketTradeSide;
  setSide: (nextSide: MarketTradeSide) => void;
  amountInput: string;
  setAmountInput: (value: string) => void;
  slippageInput: string;
  setSlippageInput: (value: string) => void;
  buyPresets: readonly string[];
  sellPresets: readonly number[];
  applyBuyPreset: (value: string) => void;
  applySellPreset: (percentage: number) => void;
  quote: TradeQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  previewStale: boolean;
  quoteBalance: bigint | null;
  tokenBalance: bigint | null;
  balancesLoading: boolean;
  validationError: string | null;
  canSubmit: boolean;
  submitting: boolean;
  submittedTxHash: string | null;
  completeSubmission: () => void;
  submitError: string | null;
  failure: MarketTradeFailureState | null;
  dismissFailure: () => void;
  minimumOutput: bigint | null;
  requiredGasFee: bigint;
  priceImpactBps: number | null;
  priceImpactLabel: string;
  impactTone: "none" | "warning" | "danger";
  requiresImpactAcknowledgement: boolean;
  impactAcknowledged: boolean;
  setImpactAcknowledged: (value: boolean) => void;
  submit: () => Promise<void>;
}

function isBuyQuote(quote: TradeQuote | null, side: MarketTradeSide): quote is MarketBuyQuote {
  return side === "buy" && quote !== null && "grossQuoteIn" in quote;
}

function isSellQuote(
  quote: TradeQuote | null,
  side: MarketTradeSide
): quote is MarketSellQuote {
  return side === "sell" && quote !== null && "grossTokenIn" in quote;
}

function buildFailureState(params: {
  code:
    | Exclude<TradeValidationCode, "invalid_amount" | "invalid_slippage" | null>
    | "slippage"
    | "wallet_rejected"
    | "unknown";
  side: MarketTradeSide;
  pair: MarketPairReadModel;
  amountInput: string;
  quote: TradeQuote | null;
  quoteBalance: bigint | null;
  tokenBalance: bigint | null;
  requiredGasFee: bigint;
  message?: string;
}): MarketTradeFailureState {
  const { code, side, pair, amountInput, quote, quoteBalance, tokenBalance, requiredGasFee } =
    params;
  const requestedAsset = side === "buy" ? pair.quoteAsset : pair.token.symbol;
  const requestedAmount = amountInput.trim().length > 0 ? `${amountInput.trim()} ${requestedAsset}` : "-";

  switch (code) {
    case "insufficient_liquidity":
      return {
        reason: "liquidity",
        title: "Trade Could Not Be Completed",
        message: "Not enough quote liquidity remains in the curve for this sell.",
        details: [
          { label: "Requested sell", value: requestedAmount },
          {
            label: "Available quote reserve",
            value: formatQuoteAmount(pair.curve.realQuote, pair.quoteAsset),
          },
          {
            label: "Creator / platform fee requirement",
            value: requiredGasFee > 0n ? formatDatoshiAsGas(requiredGasFee) : "0 GAS",
          },
        ],
      };
    case "insufficient_quote_balance":
      return {
        reason: "quote_balance",
        title: "Quote Balance Too Low",
        message: `Wallet balance is below the ${pair.quoteAsset} required for this buy.`,
        details: [
          { label: "Requested buy", value: requestedAmount },
          {
            label: `${pair.quoteAsset} wallet balance`,
            value:
              quoteBalance === null
                ? "Refreshing..."
                : formatQuoteAmount(quoteBalance, pair.quoteAsset),
          },
        ],
      };
    case "insufficient_token_balance":
      return {
        reason: "token_balance",
        title: "Token Balance Too Low",
        message: `Wallet balance is below the ${pair.token.symbol} amount requested for this sell.`,
        details: [
          { label: "Requested sell", value: requestedAmount },
          {
            label: `${pair.token.symbol} wallet balance`,
            value:
              tokenBalance === null
                ? "Refreshing..."
                : formatTokenDisplay(tokenBalance, pair.token.decimals, pair.token.symbol),
          },
        ],
      };
    case "insufficient_gas":
      return {
        reason: "gas_balance",
        title: "More GAS Is Required",
        message:
          "This sell needs extra GAS to cover creator or platform fee pulls before the wallet can submit it.",
        details: [
          {
            label: "GAS fee requirement",
            value: formatDatoshiAsGas(requiredGasFee),
          },
          {
            label: "Sell quote out",
            value:
              isSellQuote(quote, side) && quote.netQuoteOut > 0n
                ? formatQuoteAmount(quote.netQuoteOut, pair.quoteAsset)
                : "-",
          },
        ],
      };
    case "slippage":
      return {
        reason: "slippage",
        title: "Price Moved Beyond Slippage",
        message:
          "The market moved beyond your current slippage setting. Refresh the quote or increase tolerance before retrying.",
        details: [
          {
            label: "Requested trade",
            value: requestedAmount,
          },
        ],
      };
    case "wallet_rejected":
      return {
        reason: "wallet_rejected",
        title: "Wallet Signature Cancelled",
        message: "The wallet request was cancelled before the trade was submitted.",
        details: [],
      };
    case "unknown":
    default:
      return {
        reason: "unknown",
        title: "Trade Could Not Be Completed",
        message: params.message ?? "Unexpected transaction error. Check wallet details.",
        details: [],
      };
  }
}

function classifySubmitFailure(message: string): "slippage" | "wallet_rejected" | "unknown" {
  const normalized = message.toLowerCase();
  if (normalized.includes("cancelled") || normalized.includes("canceled")) {
    return "wallet_rejected";
  }
  if (normalized.includes("slippage")) {
    return "slippage";
  }
  return "unknown";
}

export function useMarketTradeFlow(
  pair: MarketPairReadModel,
  connectedAddress: string | null,
  gasBalance: bigint
): UseMarketTradeFlowResult {
  const routerHash = getRuntimeBondingCurveRouterHash();
  const [side, setSideState] = useState<MarketTradeSide>("buy");
  const [amountInput, setAmountInputState] = useState("");
  const [slippageInput, setSlippageInputState] = useState(() => {
    if (typeof window === "undefined") return "1";
    return localStorage.getItem(MARKET_TRADE_SLIPPAGE_STORAGE_KEY) ?? "1";
  });
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteBalance, setQuoteBalance] = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [failure, setFailure] = useState<MarketTradeFailureState | null>(null);
  const [impactAcknowledged, setImpactAcknowledged] = useState(false);

  const deferredAmountInput = useDeferredValue(amountInput);
  const previewStale = deferredAmountInput.trim() !== amountInput.trim();
  const amountRaw = useMemo(
    () =>
      parseTradeAmountInput(
        amountInput,
        side,
        pair.token.decimals,
        pair.quoteAsset
      ),
    [amountInput, pair.quoteAsset, pair.token.decimals, side]
  );
  const deferredAmountRaw = useMemo(
    () =>
      parseTradeAmountInput(
        deferredAmountInput,
        side,
        pair.token.decimals,
        pair.quoteAsset
      ),
    [deferredAmountInput, pair.quoteAsset, pair.token.decimals, side]
  );
  const parsedSlippage = useMemo(
    () => parseSlippagePercentInput(slippageInput),
    [slippageInput]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(MARKET_TRADE_SLIPPAGE_STORAGE_KEY, slippageInput);
  }, [slippageInput]);

  useEffect(() => {
    let cancelled = false;

    if (!connectedAddress) {
      setQuoteBalance(null);
      setTokenBalance(null);
      setBalancesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setBalancesLoading(true);
    void Promise.all([
      getTokenBalance(getQuoteAssetContractHash(pair.quoteAsset), connectedAddress),
      getTokenBalance(pair.tokenHash, connectedAddress),
    ])
      .then(([nextQuoteBalance, nextTokenBalance]) => {
        if (cancelled) return;
        setQuoteBalance(nextQuoteBalance);
        setTokenBalance(nextTokenBalance);
      })
      .finally(() => {
        if (!cancelled) {
          setBalancesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress, pair.quoteAsset, pair.tokenHash]);

  useEffect(() => {
    let cancelled = false;

    if (!routerHash) {
      setQuote(null);
      setQuoteLoading(false);
      setQuoteError("BondingCurveRouter contract hash is not configured.");
      return () => {
        cancelled = true;
      };
    }

    if (!deferredAmountInput.trim()) {
      setQuote(null);
      setQuoteLoading(false);
      setQuoteError(null);
      return () => {
        cancelled = true;
      };
    }

    if (deferredAmountRaw === null || deferredAmountRaw <= 0n) {
      setQuote(null);
      setQuoteLoading(false);
      setQuoteError(null);
      return () => {
        cancelled = true;
      };
    }

    setQuoteLoading(true);
    setQuoteError(null);

    const request =
      side === "buy"
        ? getBondingCurveBuyQuote(routerHash, pair.tokenHash, deferredAmountRaw)
        : getBondingCurveSellQuote(routerHash, pair.tokenHash, deferredAmountRaw);

    void request
      .then((nextQuote) => {
        if (cancelled) return;
        setQuote(nextQuote);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredAmountInput, deferredAmountRaw, pair.tokenHash, routerHash, side]);

  const requiredGasFee =
    isSellQuote(quote, side) ? quote.creatorFee + quote.platformFee : 0n;

  const executionPrice = useMemo(() => {
    if (isBuyQuote(quote, side)) {
      return calculateExecutionPriceRaw(
        quote.quoteConsumed,
        quote.netTokenOut,
        pair.token.decimals
      );
    }

    if (isSellQuote(quote, side)) {
      return calculateExecutionPriceRaw(
        quote.netQuoteOut,
        quote.grossTokenIn,
        pair.token.decimals
      );
    }

    return null;
  }, [pair.token.decimals, quote, side]);

  const priceImpactBps = useMemo(
    () => calculatePriceImpactBps(pair.curve.currentPrice, executionPrice),
    [executionPrice, pair.curve.currentPrice]
  );

  const impactTone =
    priceImpactBps === null
      ? "none"
      : priceImpactBps > 1_500
        ? "danger"
        : priceImpactBps > 500
          ? "warning"
          : "none";
  const requiresImpactAcknowledgement = impactTone === "danger";

  const minimumOutput = useMemo(() => {
    if (parsedSlippage.bps === null || quote === null) return null;
    if (isBuyQuote(quote, side)) {
      return calculateMinimumOutput(quote.netTokenOut, parsedSlippage.bps);
    }
    if (isSellQuote(quote, side)) {
      return calculateMinimumOutput(quote.netQuoteOut, parsedSlippage.bps);
    }
    return null;
  }, [parsedSlippage.bps, quote, side]);

  const validation = useMemo(() => {
    if (!amountInput.trim()) {
      return { code: null as TradeValidationCode, message: null as string | null };
    }

    if (parsedSlippage.reason) {
      return { code: "invalid_slippage" as TradeValidationCode, message: parsedSlippage.reason };
    }

    if (amountRaw === null) {
      const decimals = side === "buy" ? (pair.quoteAsset === "NEO" ? 0 : 8) : pair.token.decimals;
      return {
        code: "invalid_amount" as TradeValidationCode,
        message: `Enter a valid ${side === "buy" ? pair.quoteAsset : pair.token.symbol} amount with up to ${decimals} decimal places.`,
      };
    }

    if (amountRaw <= 0n) {
      return {
        code: "invalid_amount" as TradeValidationCode,
        message: "Trade amount must be greater than 0.",
      };
    }

    if (connectedAddress && side === "buy" && quoteBalance !== null && amountRaw > quoteBalance) {
      return {
        code: "insufficient_quote_balance" as TradeValidationCode,
        message: `Amount exceeds the current ${pair.quoteAsset} wallet balance.`,
      };
    }

    if (connectedAddress && side === "sell" && tokenBalance !== null && amountRaw > tokenBalance) {
      return {
        code: "insufficient_token_balance" as TradeValidationCode,
        message: `Amount exceeds the current ${pair.token.symbol} wallet balance.`,
      };
    }

    if (isSellQuote(quote, side) && !quote.liquidityOkay) {
      return {
        code: "insufficient_liquidity" as TradeValidationCode,
        message: "Not enough quote liquidity remains in the curve for this sell.",
      };
    }

    if (connectedAddress && side === "sell" && requiredGasFee > 0n && gasBalance < requiredGasFee) {
      return {
        code: "insufficient_gas" as TradeValidationCode,
        message: "More GAS is required to cover creator or platform fee pulls on this sell.",
      };
    }

    return { code: null as TradeValidationCode, message: null as string | null };
  }, [
    amountInput,
    amountRaw,
    connectedAddress,
    gasBalance,
    pair.quoteAsset,
    pair.token.decimals,
    pair.token.symbol,
    parsedSlippage.reason,
    quote,
    quoteBalance,
    requiredGasFee,
    side,
    tokenBalance,
  ]);

  const canSubmit =
    connectedAddress !== null &&
    !balancesLoading &&
    !previewStale &&
    !quoteLoading &&
    quoteError === null &&
    quote !== null &&
    validation.code === null &&
    parsedSlippage.bps !== null &&
    minimumOutput !== null &&
    !submitting &&
    (!requiresImpactAcknowledgement || impactAcknowledged);

  function clearTransientState() {
    setSubmitError(null);
    setSubmittedTxHash(null);
    setFailure(null);
  }

  function setSide(nextSide: MarketTradeSide) {
    if (nextSide === side) return;
    setSideState(nextSide);
    setAmountInputState("");
    setQuote(null);
    setImpactAcknowledged(false);
    clearTransientState();
  }

  function setAmountInput(value: string) {
    setAmountInputState(value);
    setImpactAcknowledged(false);
    clearTransientState();
  }

  function setSlippageInput(value: string) {
    setSlippageInputState(value);
    clearTransientState();
  }

  function applyBuyPreset(value: string) {
    setAmountInput(value);
  }

  function applySellPreset(percentage: number) {
    if (tokenBalance === null) return;
    const presetAmount = getSellPresetAmount(tokenBalance, percentage);
    setAmountInput(formatAmountForInput(presetAmount, pair.token.decimals));
  }

  function dismissFailure() {
    setFailure(null);
  }

  function completeSubmission() {
    setAmountInputState("");
    setSubmittedTxHash(null);
    setSubmitError(null);
    setFailure(null);
    setImpactAcknowledged(false);
  }

  async function submit() {
    if (validation.code === "invalid_amount" || validation.code === "invalid_slippage") {
      setSubmitError(validation.message);
      return;
    }

    if (
      validation.code === "insufficient_quote_balance" ||
      validation.code === "insufficient_token_balance" ||
      validation.code === "insufficient_liquidity" ||
      validation.code === "insufficient_gas"
    ) {
      setFailure(
        buildFailureState({
          code: validation.code,
          side,
          pair,
          amountInput,
          quote,
          quoteBalance,
          tokenBalance,
          requiredGasFee,
        })
      );
      setSubmitError(validation.message);
      return;
    }

    if (!routerHash || connectedAddress === null || quote === null || minimumOutput === null) {
      setSubmitError("Trade preview is unavailable.");
      return;
    }

    if (previewStale || quoteLoading) {
      setSubmitError("Refreshing trade preview...");
      return;
    }

    if (requiresImpactAcknowledgement && !impactAcknowledged) {
      setSubmitError("Acknowledge the high price impact before signing.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setFailure(null);
    setSubmittedTxHash(null);

    try {
      let txHash: string;
      if (isBuyQuote(quote, side)) {
        txHash = await invokeBondingCurveBuy(
          routerHash,
          pair.tokenHash,
          pair.quoteAsset,
          quote.grossQuoteIn,
          minimumOutput
        );
      } else if (isSellQuote(quote, side)) {
        txHash = await invokeBondingCurveSell(
          routerHash,
          pair.tokenHash,
          quote.grossTokenIn,
          minimumOutput
        );
      } else {
        setSubmitError("Trade preview is unavailable.");
        return;
      }

      setSubmittedTxHash(txHash);
    } catch (err: unknown) {
      const message = toUiErrorMessage(err);
      const failureCode = classifySubmitFailure(message);
      setSubmitError(message);
      setFailure(
        buildFailureState({
          code: failureCode,
          side,
          pair,
          amountInput,
          quote,
          quoteBalance,
          tokenBalance,
          requiredGasFee,
          message,
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    side,
    setSide,
    amountInput,
    setAmountInput,
    slippageInput,
    setSlippageInput,
    buyPresets: MARKET_TRADE_BUY_PRESETS,
    sellPresets: MARKET_TRADE_SELL_PRESETS,
    applyBuyPreset,
    applySellPreset,
    quote,
    quoteLoading,
    quoteError,
    previewStale,
    quoteBalance,
    tokenBalance,
    balancesLoading,
    validationError: submitError ?? validation.message,
    canSubmit,
    submitting,
    submittedTxHash,
    completeSubmission,
    submitError,
    failure,
    dismissFailure,
    minimumOutput,
    requiredGasFee,
    priceImpactBps,
    priceImpactLabel: formatPriceImpactBps(priceImpactBps),
    impactTone,
    requiresImpactAcknowledgement,
    impactAcknowledged,
    setImpactAcknowledged,
    submit,
  };
}
