import type { MarketLaunchSummary } from "./types";

const STORAGE_PREFIX = "forge.market.launch.";

interface StoredMarketLaunchSummary {
  tokenHash: string;
  pairLabel: string;
  quoteAsset: "GAS" | "NEO";
  launchProfile?: "starter" | "standard" | "growth" | "flagship" | null;
  tokenSymbol: string;
  curveInventoryRaw: string;
  retainedInventoryRaw: string;
  dismissed: boolean;
}

function getStorageKey(tokenHash: string): string {
  return `${STORAGE_PREFIX}${tokenHash.toLowerCase()}`;
}

export function persistMarketLaunchSummary(summary: MarketLaunchSummary): void {
  if (typeof window === "undefined") return;

  const stored: StoredMarketLaunchSummary = {
    ...summary,
    dismissed: false,
  };
  window.localStorage.setItem(getStorageKey(summary.tokenHash), JSON.stringify(stored));
}

export function readMarketLaunchSummary(
  tokenHash: string
): MarketLaunchSummary | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(getStorageKey(tokenHash));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredMarketLaunchSummary>;
    if (parsed.dismissed) return null;
    if (
      typeof parsed.tokenHash !== "string" ||
      typeof parsed.pairLabel !== "string" ||
      (parsed.quoteAsset !== "GAS" && parsed.quoteAsset !== "NEO") ||
      typeof parsed.tokenSymbol !== "string" ||
      typeof parsed.curveInventoryRaw !== "string" ||
      typeof parsed.retainedInventoryRaw !== "string"
    ) {
      return null;
    }

    return {
      tokenHash: parsed.tokenHash,
      pairLabel: parsed.pairLabel,
      quoteAsset: parsed.quoteAsset,
      launchProfile:
        parsed.launchProfile === "starter" ||
        parsed.launchProfile === "standard" ||
        parsed.launchProfile === "growth" ||
        parsed.launchProfile === "flagship"
          ? parsed.launchProfile
          : null,
      tokenSymbol: parsed.tokenSymbol,
      curveInventoryRaw: parsed.curveInventoryRaw,
      retainedInventoryRaw: parsed.retainedInventoryRaw,
    };
  } catch {
    window.localStorage.removeItem(getStorageKey(tokenHash));
    return null;
  }
}

export function dismissMarketLaunchSummary(tokenHash: string): void {
  if (typeof window === "undefined") return;

  const raw = window.localStorage.getItem(getStorageKey(tokenHash));
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredMarketLaunchSummary>;
    const next: StoredMarketLaunchSummary = {
      tokenHash: typeof parsed.tokenHash === "string" ? parsed.tokenHash : tokenHash,
      pairLabel: typeof parsed.pairLabel === "string" ? parsed.pairLabel : tokenHash,
      quoteAsset: parsed.quoteAsset === "NEO" ? "NEO" : "GAS",
      launchProfile:
        parsed.launchProfile === "starter" ||
        parsed.launchProfile === "standard" ||
        parsed.launchProfile === "growth" ||
        parsed.launchProfile === "flagship"
          ? parsed.launchProfile
          : null,
      tokenSymbol: typeof parsed.tokenSymbol === "string" ? parsed.tokenSymbol : "",
      curveInventoryRaw:
        typeof parsed.curveInventoryRaw === "string" ? parsed.curveInventoryRaw : "0",
      retainedInventoryRaw:
        typeof parsed.retainedInventoryRaw === "string" ? parsed.retainedInventoryRaw : "0",
      dismissed: true,
    };
    window.localStorage.setItem(getStorageKey(tokenHash), JSON.stringify(next));
  } catch {
    window.localStorage.removeItem(getStorageKey(tokenHash));
  }
}
