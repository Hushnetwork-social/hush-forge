import { GAS_CONTRACT_HASH } from "./forge-config";
import { formatTokenAmount, parseTokenAmountInput } from "./token-economics-logic";
import type { MarketQuoteAsset } from "./types";

const NEO_CONTRACT_HASH = "0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5";

export const MARKET_TRADE_BUY_PRESETS = ["0.1", "0.5", "1"] as const;
export const MARKET_TRADE_SELL_PRESETS = [25, 50, 75, 100] as const;
export const MARKET_TRADE_SLIPPAGE_STORAGE_KEY = "forge.market.slippage";
const MARKET_PRICE_SCALE = 1_000_000_000_000_000_000n;

export type MarketTradeSide = "buy" | "sell";

export interface ParsedSlippage {
  bps: number | null;
  reason: string | null;
}

export function getQuoteAssetContractHash(quoteAsset: MarketQuoteAsset): string {
  return quoteAsset === "NEO" ? NEO_CONTRACT_HASH : GAS_CONTRACT_HASH;
}

export function getTradeInputDecimals(
  side: MarketTradeSide,
  tokenDecimals: number,
  quoteAsset: MarketQuoteAsset
): number {
  return side === "buy" ? (quoteAsset === "NEO" ? 0 : 8) : tokenDecimals;
}

export function parseTradeAmountInput(
  value: string,
  side: MarketTradeSide,
  tokenDecimals: number,
  quoteAsset: MarketQuoteAsset
): bigint | null {
  return parseTokenAmountInput(
    value,
    getTradeInputDecimals(side, tokenDecimals, quoteAsset)
  );
}

export function parseSlippagePercentInput(value: string): ParsedSlippage {
  const trimmed = value.trim();
  if (!trimmed) {
    return { bps: null, reason: "Slippage is required." };
  }

  if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
    return { bps: null, reason: "Enter slippage as a percent with up to 2 decimals." };
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isFinite(bps) || bps < 0) {
    return { bps: null, reason: "Slippage must be a positive percentage." };
  }

  if (bps > 10_000) {
    return { bps: null, reason: "Slippage cannot exceed 100%." };
  }

  return { bps, reason: null };
}

export function calculateMinimumOutput(
  expectedOutput: bigint,
  slippageBps: number | null
): bigint | null {
  if (slippageBps === null || expectedOutput <= 0n) return null;
  const tolerance = 10_000n - BigInt(slippageBps);
  return (expectedOutput * tolerance) / 10_000n;
}

export function formatAmountForInput(amount: bigint, decimals: number): string {
  return formatTokenAmount(amount, decimals).replaceAll(",", "");
}

export function getSellPresetAmount(balance: bigint, percentage: number): bigint {
  return (balance * BigInt(percentage)) / 100n;
}

export function calculateExecutionPriceRaw(
  quoteAmount: bigint,
  tokenAmount: bigint
): bigint | null {
  if (quoteAmount <= 0n || tokenAmount <= 0n) return null;
  return (quoteAmount * MARKET_PRICE_SCALE) / tokenAmount;
}

export function calculatePriceImpactBps(
  currentPrice: bigint,
  executionPrice: bigint | null
): number | null {
  if (currentPrice <= 0n || executionPrice === null || executionPrice <= 0n) {
    return null;
  }

  const delta =
    executionPrice > currentPrice
      ? executionPrice - currentPrice
      : currentPrice - executionPrice;

  return Number((delta * 10_000n) / currentPrice);
}

export function formatPriceImpactBps(priceImpactBps: number | null): string {
  if (priceImpactBps === null) return "-";
  return `${(priceImpactBps / 100).toFixed(2)}%`;
}
