import type {
  BurnConfirmationSummary,
  TokenEconomicsView,
  TokenInfo,
} from "./types";

const GAS_FACTOR = 100_000_000n;

export const TOKEN_TAX_NETWORK_FEE_DISCLAIMER =
  "Neo network GAS fees are charged separately and may be shown differently by your wallet. They are not part of token taxes.";

function trimTrailingFractionZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

function normalizeDatoshi(value: bigint | number): bigint {
  return typeof value === "bigint" ? value : BigInt(Math.trunc(value));
}

export function isFactoryToken(token: TokenInfo | null): token is TokenInfo {
  return token !== null && token.creator !== null && !(token.isNative ?? false);
}

export function formatBasisPointsAsPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export function formatDatoshiAsGas(datoshi: bigint | number): string {
  const raw = normalizeDatoshi(datoshi);
  const whole = raw / GAS_FACTOR;
  const fraction = (raw % GAS_FACTOR).toString().padStart(8, "0");
  const wholeFormatted = whole.toLocaleString("en-US");
  const trimmedFraction = fraction.replace(/0+$/, "");

  if (!trimmedFraction) {
    return `${wholeFormatted} GAS`;
  }

  return `${wholeFormatted}.${trimmedFraction} GAS`;
}

export function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  if (decimals === 0) {
    return rawAmount.toLocaleString("en-US");
  }

  const factor = 10n ** BigInt(decimals);
  const whole = rawAmount / factor;
  const fraction = (rawAmount % factor).toString().padStart(decimals, "0");
  return trimTrailingFractionZeros(`${whole.toLocaleString("en-US")}.${fraction}`);
}

export function parseTokenAmountInput(
  value: string,
  decimals: number
): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;

  const paddedFraction = fraction.padEnd(decimals, "0");
  try {
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(paddedFraction || "0");
  } catch {
    return null;
  }
}

export function getTokenEconomicsView(
  token: TokenInfo | null
): TokenEconomicsView | null {
  if (!isFactoryToken(token)) return null;

  const burnRateBps = token.burnRate ?? 0;
  const creatorFeeDatoshi = normalizeDatoshi(token.creatorFeeRate ?? 0);
  const platformFeeDatoshi = normalizeDatoshi(token.platformFeeRate ?? 0);

  return {
    burnRateBps,
    burnRateDisplay: formatBasisPointsAsPercent(burnRateBps),
    creatorFeeDatoshi,
    creatorFeeDisplay: formatDatoshiAsGas(creatorFeeDatoshi),
    platformFeeDatoshi,
    platformFeeDisplay: formatDatoshiAsGas(platformFeeDatoshi),
    networkFeeDisclaimer: TOKEN_TAX_NETWORK_FEE_DISCLAIMER,
  };
}

export function buildBurnConfirmationSummary(
  token: TokenInfo | null,
  amountRaw: bigint | null
): BurnConfirmationSummary | null {
  if (token === null) return null;

  const economics = getTokenEconomicsView(token);
  if (economics === null) return null;

  return {
    amountRaw,
    amountDisplay:
      amountRaw === null ? "0" : formatTokenAmount(amountRaw, token.decimals),
    creatorFeeDatoshi: economics.creatorFeeDatoshi,
    creatorFeeDisplay: economics.creatorFeeDisplay,
    platformFeeDatoshi: economics.platformFeeDatoshi,
    platformFeeDisplay: economics.platformFeeDisplay,
    networkFeeDisclaimer: economics.networkFeeDisclaimer,
  };
}
