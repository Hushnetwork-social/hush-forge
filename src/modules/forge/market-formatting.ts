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

export function formatTokenDisplay(
  amount: bigint | null,
  decimals: number,
  symbol?: string
): string {
  if (amount === null) return "-";
  const value = formatTokenAmount(amount, decimals);
  return symbol ? `${value} ${symbol}` : value;
}

export function formatProgressPercent(progressBps: number): string {
  return `${(progressBps / 100).toFixed(2)}%`;
}

export function formatRelativeCreatedAt(timestamp: number | null): string {
  if (timestamp === null) return "-";

  const createdMs = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const deltaMs = Date.now() - createdMs;
  const deltaMinutes = Math.max(1, Math.floor(deltaMs / 60_000));

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}
