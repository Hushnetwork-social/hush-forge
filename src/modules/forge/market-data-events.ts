"use client";

export const MARKET_DATA_INVALIDATED_EVENT = "forge:market-data-invalidated";

export interface MarketDataInvalidatedDetail {
  tokenHash: string;
  reason: "trade_confirmation" | "market_launch" | "admin_update";
  occurredAt: number;
}

function normalizeTokenHash(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

export function dispatchMarketDataInvalidated(
  tokenHash: string,
  reason: MarketDataInvalidatedDetail["reason"] = "trade_confirmation"
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MarketDataInvalidatedDetail>(MARKET_DATA_INVALIDATED_EVENT, {
      detail: {
        tokenHash: normalizeTokenHash(tokenHash),
        reason,
        occurredAt: Date.now(),
      },
    })
  );
}

export function isMarketDataInvalidationForToken(
  detail: MarketDataInvalidatedDetail | null | undefined,
  tokenHash: string
): boolean {
  if (!detail || !tokenHash) {
    return false;
  }

  return normalizeTokenHash(detail.tokenHash) === normalizeTokenHash(tokenHash);
}
