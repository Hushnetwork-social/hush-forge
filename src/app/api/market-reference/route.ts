import { NextResponse } from "next/server";

const CACHE_TTL_MS = 60_000;
const DEFAULT_ASSETS = ["GAS", "NEO"] as const;
const PROVIDER_NAME = "CoinGecko";
const COINGECKO_IDS: Record<(typeof DEFAULT_ASSETS)[number], string> = {
  GAS: "gas",
  NEO: "neo",
};

type SupportedAsset = (typeof DEFAULT_ASSETS)[number];

interface CachedPriceEntry {
  usd: number;
  lastUpdatedAt: number | null;
}

interface MarketReferenceResponse {
  provider: string;
  fetchedAt: number;
  prices: Partial<Record<SupportedAsset, CachedPriceEntry>>;
}

let cachedSnapshot: MarketReferenceResponse | null = null;
let inflightRefresh: Promise<MarketReferenceResponse> | null = null;

function isSupportedAsset(value: string): value is SupportedAsset {
  return value === "GAS" || value === "NEO";
}

function parseRequestedAssets(request: Request): SupportedAsset[] {
  const url = new URL(request.url);
  const rawAssets = url.searchParams.get("asset") ?? url.searchParams.get("assets");

  if (!rawAssets) {
    return [...DEFAULT_ASSETS];
  }

  const assets = rawAssets
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

  const validAssets = assets.filter(isSupportedAsset);
  return validAssets.length > 0 ? [...new Set(validAssets)] : [...DEFAULT_ASSETS];
}

function selectPrices(
  snapshot: MarketReferenceResponse,
  assets: SupportedAsset[]
): MarketReferenceResponse {
  return {
    provider: snapshot.provider,
    fetchedAt: snapshot.fetchedAt,
    prices: assets.reduce<MarketReferenceResponse["prices"]>((accumulator, asset) => {
      const price = snapshot.prices[asset];
      if (price) {
        accumulator[asset] = price;
      }
      return accumulator;
    }, {}),
  };
}

async function refreshSnapshot(): Promise<MarketReferenceResponse> {
  const coinIds = DEFAULT_ASSETS.map((asset) => COINGECKO_IDS[asset]).join(",");
  const endpoint = new URL("https://api.coingecko.com/api/v3/simple/price");
  endpoint.searchParams.set("ids", coinIds);
  endpoint.searchParams.set("vs_currencies", "usd");
  endpoint.searchParams.set("include_last_updated_at", "true");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      ...(process.env.COINGECKO_DEMO_API_KEY
        ? { "x-cg-demo-api-key": process.env.COINGECKO_DEMO_API_KEY }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Record<
    string,
    { usd?: number; last_updated_at?: number }
  >;

  const snapshot: MarketReferenceResponse = {
    provider: PROVIDER_NAME,
    fetchedAt: Date.now(),
    prices: {},
  };

  for (const asset of DEFAULT_ASSETS) {
    const entry = payload[COINGECKO_IDS[asset]];
    if (!entry || typeof entry.usd !== "number") continue;

    snapshot.prices[asset] = {
      usd: entry.usd,
      lastUpdatedAt:
        typeof entry.last_updated_at === "number" ? entry.last_updated_at : null,
    };
  }

  if (Object.keys(snapshot.prices).length === 0) {
    throw new Error("CoinGecko response did not contain any supported asset prices.");
  }

  cachedSnapshot = snapshot;
  return snapshot;
}

async function getSharedSnapshot(): Promise<MarketReferenceResponse> {
  if (cachedSnapshot && Date.now() - cachedSnapshot.fetchedAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  if (!inflightRefresh) {
    inflightRefresh = refreshSnapshot().finally(() => {
      inflightRefresh = null;
    });
  }

  return inflightRefresh;
}

export async function GET(request: Request) {
  const requestedAssets = parseRequestedAssets(request);

  try {
    const snapshot = await getSharedSnapshot();
    const body = selectPrices(snapshot, requestedAssets);

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        provider: PROVIDER_NAME,
        fetchedAt: Date.now(),
        prices: {},
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh USD reference prices.",
      },
      { status: 502 }
    );
  }
}
