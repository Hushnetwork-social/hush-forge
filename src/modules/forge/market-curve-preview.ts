import type { MarketCurveState } from "./types";

const PRICE_SCALE = 1_000_000_000_000_000_000n;
const DEFAULT_POINT_COUNT = 40;

export type CurvePreviewMetric = "price" | "market-cap";

export interface CurvePreviewPoint {
  reserveQuote: bigint;
  tokenReserve: bigint;
  circulatingSupply: bigint;
  price: bigint;
  marketCap: bigint;
  progressBps: number;
}

export interface CurvePreviewSeries {
  points: CurvePreviewPoint[];
  launchPoint: CurvePreviewPoint;
  currentPoint: CurvePreviewPoint;
  graduationPoint: CurvePreviewPoint;
  domainEndQuote: bigint;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    return 0n;
  }
  if (numerator <= 0n) {
    return 0n;
  }
  return (numerator + denominator - 1n) / denominator;
}

function resolveInvariant(curve: MarketCurveState): bigint {
  const quoteTotal = curve.virtualQuote + curve.realQuote;
  const derivedInvariant =
    quoteTotal > 0n && curve.virtualTokens >= 0n && curve.currentCurveInventory >= 0n
      ? quoteTotal * (curve.virtualTokens + curve.currentCurveInventory)
      : 0n;

  if (curve.invariantK <= 0n) {
    return derivedInvariant;
  }

  const simulatedCurrentTotalTokens = ceilDiv(curve.invariantK, quoteTotal);
  const simulatedCurrentReserve =
    simulatedCurrentTotalTokens > curve.virtualTokens
      ? simulatedCurrentTotalTokens - curve.virtualTokens
      : 0n;

  return simulatedCurrentReserve === curve.currentCurveInventory
    ? curve.invariantK
    : derivedInvariant;
}

export function buildCurvePreviewPoint(
  curve: MarketCurveState,
  reserveQuote: bigint,
  invariant = resolveInvariant(curve)
): CurvePreviewPoint {
  const normalizedReserve = reserveQuote < 0n ? 0n : reserveQuote;
  const quoteTotal = curve.virtualQuote + normalizedReserve;
  const totalTokens = ceilDiv(invariant, quoteTotal);
  const tokenReserve =
    totalTokens > curve.virtualTokens ? totalTokens - curve.virtualTokens : 0n;
  const effectiveTokenTotal = curve.virtualTokens + tokenReserve;
  const price =
    quoteTotal > 0n && effectiveTokenTotal > 0n
      ? (quoteTotal * PRICE_SCALE) / effectiveTokenTotal
      : 0n;
  const marketCap = (price * curve.totalSupply) / PRICE_SCALE;
  const circulatingSupply =
    curve.totalSupply > tokenReserve ? curve.totalSupply - tokenReserve : 0n;
  const progressBps =
    curve.graduationThreshold > 0n
      ? Number((normalizedReserve * 10_000n) / curve.graduationThreshold)
      : 0;

  return {
    reserveQuote: normalizedReserve,
    tokenReserve,
    circulatingSupply,
    price,
    marketCap,
    progressBps,
  };
}

export function buildCurvePreviewSeries(
  curve: MarketCurveState,
  pointCount = DEFAULT_POINT_COUNT
): CurvePreviewSeries {
  const normalizedPointCount = Math.max(8, pointCount);
  const domainEndQuote =
    curve.realQuote > curve.graduationThreshold
      ? curve.realQuote
      : curve.graduationThreshold > 0n
        ? curve.graduationThreshold
        : curve.realQuote > 0n
          ? curve.realQuote
          : 1n;
  const invariant = resolveInvariant(curve);

  const points = Array.from({ length: normalizedPointCount }, (_, index) => {
    const ratioNumerator = BigInt(index);
    const ratioDenominator = BigInt(normalizedPointCount - 1);
    const reserveQuote =
      ratioDenominator > 0n
        ? (domainEndQuote * ratioNumerator) / ratioDenominator
        : 0n;
    return buildCurvePreviewPoint(curve, reserveQuote, invariant);
  });

  return {
    points,
    launchPoint: buildCurvePreviewPoint(curve, 0n, invariant),
    currentPoint: buildCurvePreviewPoint(curve, curve.realQuote, invariant),
    graduationPoint: buildCurvePreviewPoint(
      curve,
      curve.graduationThreshold,
      invariant
    ),
    domainEndQuote,
  };
}
