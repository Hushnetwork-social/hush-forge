import { formatTokenAmount } from "./token-economics-logic";
import type { MarketPairStatus, MarketQuoteAsset } from "./types";

function toNumber(value: bigint | number): number {
  if (typeof value === "number") return value;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > max ? max : value);
}

export function getQuoteAssetDecimals(quoteAsset: MarketQuoteAsset): number {
  return quoteAsset === "GAS" ? 8 : 0;
}

export function formatQuoteAmount(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset
): string {
  if (amount === null) return "-";
  return `${formatTokenAmount(amount, getQuoteAssetDecimals(quoteAsset))} ${quoteAsset}`;
}

export function formatCompactMarketCount(value: bigint | number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

export function formatPairStatus(status: MarketPairStatus): string {
  switch (status) {
    case "graduation_ready":
      return "Graduation Ready";
    case "active":
      return "Active";
    default:
      return "Unknown";
  }
}
