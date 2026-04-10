import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASELINE_MARKET_ENHANCEMENT_CAPABILITIES,
  BASELINE_MARKET_ENHANCEMENT_SERVICES,
  getBaselineMarketPair,
  listBaselineMarketPairs,
  listBaselineTrendingMarkets,
} from "./market-data-service";
import type { MarketCurveState, TokenInfo } from "./types";

vi.mock("./forge-config", () => ({
  getRuntimeFactoryHash: vi.fn(),
  getRuntimeBondingCurveRouterHash: vi.fn(),
  saveBondingCurveRouterHash: vi.fn(),
}));

vi.mock("./neo-rpc-client", () => ({
  getAllFactoryTokenHashes: vi.fn(),
  getBondingCurveState: vi.fn(),
  getBondingCurveGraduationProgress: vi.fn(),
  invokeFunction: vi.fn(),
  isContractDeployed: vi.fn(),
}));

vi.mock("./token-metadata-service", () => ({
  resolveTokenMetadata: vi.fn(),
}));

import {
  getRuntimeBondingCurveRouterHash,
  getRuntimeFactoryHash,
} from "./forge-config";
import {
  getAllFactoryTokenHashes,
  getBondingCurveGraduationProgress,
  getBondingCurveState,
  invokeFunction,
  isContractDeployed,
} from "./neo-rpc-client";
import { resolveTokenMetadata } from "./token-metadata-service";

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "Hush Token",
    creator: "0xcreator",
    supply: 1_000_000n,
    decimals: 8,
    mode: "speculative",
    tier: 0,
    createdAt: 100,
    ...overrides,
  };
}

function makeCurve(tokenHash: string, overrides: Partial<MarketCurveState> = {}): MarketCurveState {
  return {
    tokenHash,
    contractStatus: "Active",
    status: "active",
    quoteAsset: "GAS",
    virtualQuote: 100_000_000n,
    virtualTokens: 250_000n,
    realQuote: 25_000_000n,
    currentCurveInventory: 750_000n,
    invariantK: 125_000_000_000_000n,
    graduationThreshold: 50_000_000n,
    graduationReady: false,
    currentPrice: 123_456n,
    totalTrades: 42n,
    createdAt: 200,
    curveInventory: 900_000n,
    retainedInventory: 100_000n,
    totalSupply: 1_000_000n,
    ...overrides,
  };
}

describe("market-data-service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getRuntimeFactoryHash).mockReturnValue("0xfactory");
    vi.mocked(getRuntimeBondingCurveRouterHash).mockReturnValue("0xrouter");
    vi.mocked(isContractDeployed).mockResolvedValue(true);
  });

  it("lists tradable curve-backed pairs with successful reads and sorts newest first", async () => {
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xaaa", "0xbbb", "0xccc"]);
    vi.mocked(resolveTokenMetadata)
      .mockResolvedValueOnce(makeToken({ contractHash: "0xaaa", symbol: "AAA", createdAt: 10 }))
      .mockResolvedValueOnce(
        makeToken({
          contractHash: "0xbbb",
          symbol: "BBB",
          mode: "community",
          createdAt: 20,
        })
      )
      .mockResolvedValueOnce(makeToken({ contractHash: "0xccc", symbol: "CCC", createdAt: 30 }));

    vi.mocked(getBondingCurveState)
      .mockResolvedValueOnce(makeCurve("0xaaa"))
      .mockRejectedValueOnce(new Error("curve not registered"))
      .mockResolvedValueOnce(makeCurve("0xccc", { quoteAsset: "NEO" }));

    const result = await listBaselineMarketPairs();

    expect(result).toHaveLength(2);
    expect(result[0].tokenHash).toBe("0xccc");
    expect(result[0].pairLabel).toBe("CCC/NEO");
    expect(result[1].pairLabel).toBe("AAA/GAS");
    expect(vi.mocked(getBondingCurveState)).toHaveBeenNthCalledWith(1, "0xrouter", "0xaaa");
    expect(vi.mocked(getBondingCurveState)).toHaveBeenNthCalledWith(2, "0xrouter", "0xbbb");
    expect(vi.mocked(getBondingCurveState)).toHaveBeenNthCalledWith(3, "0xrouter", "0xccc");
  });

  it("filters market pairs by search query across symbol and hash", async () => {
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xaaa"]);
    vi.mocked(resolveTokenMetadata).mockResolvedValue(
      makeToken({ contractHash: "0xaaa", symbol: "ALPHA" })
    );
    vi.mocked(getBondingCurveState).mockResolvedValue(makeCurve("0xaaa"));

    await expect(listBaselineMarketPairs("alpha")).resolves.toHaveLength(1);
    await expect(listBaselineMarketPairs("0xaaa")).resolves.toHaveLength(1);
    await expect(listBaselineMarketPairs("missing")).resolves.toHaveLength(0);
  });

  it("returns the latest added pairs for the baseline trending strip", async () => {
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xaaa", "0xbbb"]);
    vi.mocked(resolveTokenMetadata)
      .mockResolvedValueOnce(makeToken({ contractHash: "0xaaa", symbol: "AAA", createdAt: 10 }))
      .mockResolvedValueOnce(makeToken({ contractHash: "0xbbb", symbol: "BBB", createdAt: 20 }));
    vi.mocked(getBondingCurveState)
      .mockResolvedValueOnce(makeCurve("0xaaa"))
      .mockResolvedValueOnce(makeCurve("0xbbb"));

    const result = await listBaselineTrendingMarkets(1);

    expect(result).toHaveLength(1);
    expect(result[0].tokenHash).toBe("0xbbb");
  });

  it("includes tokens whose curve is live even if the factory mode has not refreshed yet", async () => {
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xcurve"]);
    vi.mocked(resolveTokenMetadata).mockResolvedValue(
      makeToken({
        contractHash: "0xcurve",
        symbol: "CURVE",
        mode: "community",
      })
    );
    vi.mocked(getBondingCurveState).mockResolvedValue(makeCurve("0xcurve"));

    const result = await listBaselineMarketPairs();

    expect(result).toHaveLength(1);
    expect(result[0].tokenHash).toBe("0xcurve");
    expect(result[0].pairLabel).toBe("CURVE/GAS");
  });

  it("builds a pair read model and falls back to curve-derived graduation progress", async () => {
    vi.mocked(resolveTokenMetadata).mockResolvedValue(
      makeToken({ contractHash: "0xpair", symbol: "PAIR" })
    );
    vi.mocked(getBondingCurveState).mockResolvedValue(
      makeCurve("0xpair", { realQuote: 45_000_000n })
    );
    vi.mocked(getBondingCurveGraduationProgress).mockRejectedValue(new Error("index not ready"));

    const result = await getBaselineMarketPair("0xpair");

    expect(result).not.toBeNull();
    expect(result!.pairLabel).toBe("PAIR/GAS");
    expect(result!.graduation.progressBps).toBe(9000);
    expect(result!.capabilities.contractChangeFeed).toBe(true);
  });

  it("throws a clear error when the router hash is missing", async () => {
    vi.mocked(getRuntimeBondingCurveRouterHash).mockReturnValue("");
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xaaa"]);
    vi.mocked(resolveTokenMetadata).mockResolvedValue(
      makeToken({ contractHash: "0xaaa", symbol: "AAA" })
    );

    await expect(listBaselineMarketPairs()).rejects.toThrow(/BondingCurveRouter contract hash/i);
  });

  it("returns an empty list when no tradable pairs exist even if the router hash is missing", async () => {
    vi.mocked(getRuntimeBondingCurveRouterHash).mockReturnValue("");
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xaaa"]);
    vi.mocked(resolveTokenMetadata).mockResolvedValue(
      makeToken({ contractHash: "0xaaa", symbol: "AAA", mode: "community" })
    );

    await expect(listBaselineMarketPairs()).resolves.toEqual([]);
  });

  it("exposes disabled enhancement providers and baseline capability flags", async () => {
    expect(BASELINE_MARKET_ENHANCEMENT_CAPABILITIES.contractChangeFeed).toBe(true);
    expect(BASELINE_MARKET_ENHANCEMENT_CAPABILITIES.candles).toBe(false);
    expect(BASELINE_MARKET_ENHANCEMENT_SERVICES.discovery.isAvailable()).toBe(false);
    await expect(BASELINE_MARKET_ENHANCEMENT_SERVICES.candles.getCandles({
      tokenHash: "0xtoken",
      interval: "1m",
    })).resolves.toEqual([]);
  });

  it("refreshes a stale saved router hash from the factory before loading pairs", async () => {
    vi.mocked(getRuntimeBondingCurveRouterHash).mockReturnValue("0xstale");
    vi.mocked(isContractDeployed)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.mocked(invokeFunction).mockResolvedValue({
      state: "HALT",
      gasconsumed: "0",
      script: "",
      stack: [
        {
          type: "ByteString",
          value: "Wh6uOnLCLv0x3F8gg7f9sd0cD4M=",
        },
      ],
    });
    vi.mocked(getAllFactoryTokenHashes).mockResolvedValue(["0xaaa"]);
    vi.mocked(resolveTokenMetadata).mockResolvedValue(
      makeToken({ contractHash: "0xaaa", symbol: "AAA", mode: "community" })
    );
    vi.mocked(getBondingCurveState).mockResolvedValue(makeCurve("0xaaa"));

    const result = await listBaselineMarketPairs();

    expect(result).toHaveLength(1);
    expect(vi.mocked(invokeFunction)).toHaveBeenCalledWith(
      "0xfactory",
      "getBondingCurveRouter",
      []
    );
    expect(vi.mocked(getBondingCurveState)).toHaveBeenCalledWith(
      "0x830f1cddb1fdb783205fdc31fd2ec2723aae1e5a",
      "0xaaa"
    );
  });
});
