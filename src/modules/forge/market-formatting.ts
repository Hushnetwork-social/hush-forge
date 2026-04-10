import { formatTokenAmount } from "./token-economics-logic";
import type { MarketPairStatus, MarketQuoteAsset } from "./types";

const PRICE_SCALE_DECIMALS = 18;
const SUBSCRIPT_DIGITS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

function toNumber(value: bigint | number): number {
  if (typeof value === "number") return value;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > max ? max : value);
}

function trimTrailingFractionZeros(value: string): string {
  return value.replace(/0+$/, "");
}

function toSubscriptDigits(value: number): string {
  return String(value)
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[digit] ?? digit)
    .join("");
}

function formatScaledAmount(
  amount: bigint,
  decimals: number
): { whole: bigint; fraction: string } {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, "0");

  return { whole, fraction };
}

function scaledAmountToNumber(amount: bigint, decimals: number): number {
  const isNegative = amount < 0n;
  const normalized = isNegative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = normalized / divisor;
  const fraction = normalized % divisor;
  const value = Number(whole) + Number(fraction) / 10 ** decimals;
  return isNegative ? -value : value;
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

export function formatQuoteAmountRounded(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset,
  maximumFractionDigits = 2
): string {
  const value = quoteAmountToNumber(amount, quoteAsset);
  if (value === null) return "-";

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)} ${quoteAsset}`;
}

export function quoteAmountToNumber(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset
): number | null {
  if (amount === null) return null;
  return scaledAmountToNumber(amount, getQuoteAssetDecimals(quoteAsset));
}

export function formatQuoteAmountSummary(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset
): string {
  const value = quoteAmountToNumber(amount, quoteAsset);
  if (value === null) return "-";

  const maximumFractionDigits =
    quoteAsset === "NEO" ? 0 : value >= 1_000 ? 0 : value >= 1 ? 2 : 4;

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)} ${quoteAsset}`;
}

export function formatMarketPrice(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset,
  tokenDecimals = 0
): string {
  if (amount === null) return "-";
  if (amount === 0n) return `0 ${quoteAsset}`;

  const decimals = Math.max(
    0,
    PRICE_SCALE_DECIMALS + getQuoteAssetDecimals(quoteAsset) - tokenDecimals
  );
  const { whole, fraction } = formatScaledAmount(amount, decimals);
  const wholeFormatted = whole.toLocaleString("en-US");

  if (whole > 0n) {
    const trimmed = trimTrailingFractionZeros(fraction).slice(0, 8).replace(/0+$/, "");
    return trimmed ? `${wholeFormatted}.${trimmed} ${quoteAsset}` : `${wholeFormatted} ${quoteAsset}`;
  }

  const firstNonZeroIndex = fraction.search(/[1-9]/);
  if (firstNonZeroIndex === -1) {
    return `0 ${quoteAsset}`;
  }

  if (firstNonZeroIndex >= 4) {
    const significantDigits = fraction
      .slice(firstNonZeroIndex, firstNonZeroIndex + 4)
      .padEnd(4, "0");
    return `0.0${toSubscriptDigits(firstNonZeroIndex)}${significantDigits} ${quoteAsset}`;
  }

  const trimmed = trimTrailingFractionZeros(fraction).slice(0, 8).replace(/0+$/, "");
  return trimmed ? `0.${trimmed} ${quoteAsset}` : `0 ${quoteAsset}`;
}

export function marketPriceToNumber(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset,
  tokenDecimals = 0
): number | null {
  if (amount === null) return null;
  const decimals = Math.max(
    0,
    PRICE_SCALE_DECIMALS + getQuoteAssetDecimals(quoteAsset) - tokenDecimals
  );
  return scaledAmountToNumber(amount, decimals);
}

export function quoteAmountToUsd(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset,
  quoteAssetUsdPrice: number | null
): number | null {
  if (quoteAssetUsdPrice === null) return null;
  const nativeAmount = quoteAmountToNumber(amount, quoteAsset);
  return nativeAmount === null ? null : nativeAmount * quoteAssetUsdPrice;
}

export function marketPriceToUsd(
  amount: bigint | null,
  quoteAsset: MarketQuoteAsset,
  tokenDecimals: number,
  quoteAssetUsdPrice: number | null
): number | null {
  if (quoteAssetUsdPrice === null) return null;
  const nativeAmount = marketPriceToNumber(amount, quoteAsset, tokenDecimals);
  return nativeAmount === null ? null : nativeAmount * quoteAssetUsdPrice;
}

export function formatUsdPrice(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "-";

  const maximumFractionDigits =
    amount >= 1 ? 2 : amount >= 0.01 ? 4 : amount >= 0.0001 ? 6 : 8;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(amount);
}

export function formatUsdCompactAmount(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "-";

  if (Math.abs(amount) < 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(amount);
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

export function formatTokenDisplayRounded(
  amount: bigint | null,
  decimals: number,
  symbol?: string,
  fractionDigits = 2
): string {
  if (amount === null) return "-";

  const normalizedFractionDigits = Math.max(0, fractionDigits);
  const isNegative = amount < 0n;
  const absoluteAmount = isNegative ? -amount : amount;

  let scaledAmount = absoluteAmount;
  if (decimals > normalizedFractionDigits) {
    const trimFactor = 10n ** BigInt(decimals - normalizedFractionDigits);
    scaledAmount = (absoluteAmount + trimFactor / 2n) / trimFactor;
  } else if (decimals < normalizedFractionDigits) {
    scaledAmount = absoluteAmount * 10n ** BigInt(normalizedFractionDigits - decimals);
  }

  if (normalizedFractionDigits === 0) {
    const value = `${isNegative ? "-" : ""}${scaledAmount.toLocaleString("en-US")}`;
    return symbol ? `${value} ${symbol}` : value;
  }

  const divisor = 10n ** BigInt(normalizedFractionDigits);
  const whole = scaledAmount / divisor;
  const fraction = (scaledAmount % divisor)
    .toString()
    .padStart(normalizedFractionDigits, "0");
  const value = `${isNegative ? "-" : ""}${whole.toLocaleString("en-US")}.${fraction}`;

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
