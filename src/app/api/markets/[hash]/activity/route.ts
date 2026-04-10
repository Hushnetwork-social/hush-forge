import { NextRequest, NextResponse } from "next/server";
import { getMarketActivitySnapshot } from "@/modules/forge/market-activity-cache";
import {
  BONDING_CURVE_ROUTER_HASH,
  PRIVATE_NET_RPC_URL,
} from "@/modules/forge/forge-config";
import type { MarketActivitySnapshot } from "@/modules/forge/types";

export const runtime = "nodejs";

interface SerializedMarketActivitySnapshot {
  tokenHash: string;
  interval: "15m";
  indexedThroughBlock: number;
  indexedAt: number;
  candles: Array<{
    time: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  trades: Array<{
    id: string;
    occurredAt: number;
    side: "buy" | "sell";
    trader: string;
    quoteAsset: "GAS" | "NEO";
    quoteAmount: string;
    tokenAmount: string;
    price: string;
    txHash: string;
  }>;
  holders: Array<{
    rank: number;
    address: string;
    balance: string;
    shareBps: number | null;
  }>;
  topTraders: Array<{
    rank: number;
    address: string;
    totalTrades: number;
    buyVolume: string;
    sellVolume: string;
    netQuoteVolume: string;
  }>;
}

function resolveTokenHash(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const hash = segments.at(-2);
  return hash ? decodeURIComponent(hash) : "";
}

function resolveRouterHash(request: NextRequest): string {
  const queryValue = request.nextUrl.searchParams.get("routerHash")?.trim();
  if (queryValue) {
    return queryValue;
  }

  if (BONDING_CURVE_ROUTER_HASH && BONDING_CURVE_ROUTER_HASH !== "0x") {
    return BONDING_CURVE_ROUTER_HASH;
  }

  throw new Error("BondingCurveRouter contract hash is not configured.");
}

function resolveRpcUrl(request: NextRequest): string {
  if (!PRIVATE_NET_RPC_URL) {
    throw new Error("NEXT_PUBLIC_NEO_RPC_URL is not configured.");
  }

  if (/^https?:\/\//i.test(PRIVATE_NET_RPC_URL)) {
    return PRIVATE_NET_RPC_URL;
  }

  return new URL(PRIVATE_NET_RPC_URL, request.url).toString();
}

function serializeSnapshot(
  snapshot: MarketActivitySnapshot
): SerializedMarketActivitySnapshot {
  return {
    tokenHash: snapshot.tokenHash,
    interval: snapshot.interval,
    indexedThroughBlock: snapshot.indexedThroughBlock,
    indexedAt: snapshot.indexedAt,
    candles: snapshot.candles.map((candle) => ({
      time: candle.time,
      open: candle.open.toString(),
      high: candle.high.toString(),
      low: candle.low.toString(),
      close: candle.close.toString(),
      volume: candle.volume.toString(),
    })),
    trades: snapshot.trades.map((trade) => ({
      ...trade,
      quoteAmount: trade.quoteAmount.toString(),
      tokenAmount: trade.tokenAmount.toString(),
      price: trade.price.toString(),
    })),
    holders: snapshot.holders.map((holder) => ({
      ...holder,
      balance: holder.balance.toString(),
    })),
    topTraders: snapshot.topTraders.map((trader) => ({
      ...trader,
      buyVolume: trader.buyVolume.toString(),
      sellVolume: trader.sellVolume.toString(),
      netQuoteVolume: trader.netQuoteVolume.toString(),
    })),
  };
}

export async function GET(request: NextRequest) {
  const tokenHash = resolveTokenHash(request);

  if (!tokenHash) {
    return NextResponse.json(
      { error: "Token hash is required." },
      { status: 400 }
    );
  }

  try {
    const snapshot = await getMarketActivitySnapshot({
      tokenHash,
      routerHash: resolveRouterHash(request),
      rpcUrl: resolveRpcUrl(request),
    });

    return NextResponse.json(serializeSnapshot(snapshot), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build on-chain market activity preview.",
      },
      { status: 502 }
    );
  }
}
