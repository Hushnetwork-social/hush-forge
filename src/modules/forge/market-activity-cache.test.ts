import { describe, expect, it } from "vitest";
import {
  applyTradeToCandle,
  buildContinuousCandles,
  buildHolderEntries,
  buildTopTraderEntries,
} from "./market-activity-cache";
import type { MarketCandle, MarketTradeHistoryEntry } from "./types";

describe("market-activity-cache helpers", () => {
  it("buckets trades into 15m candles and updates OHLCV", () => {
    const candles = new Map();
    const firstTrade: MarketTradeHistoryEntry = {
      id: "tx-1:0",
      occurredAt: Date.UTC(2026, 3, 10, 12, 2, 0),
      side: "buy",
      trader: "Nabc",
      quoteAsset: "GAS",
      quoteAmount: 5_00000000n,
      tokenAmount: 1_00000000n,
      price: 1_20000000n,
      txHash: "0xtx1",
    };
    const secondTrade: MarketTradeHistoryEntry = {
      ...firstTrade,
      id: "tx-2:0",
      occurredAt: Date.UTC(2026, 3, 10, 12, 11, 0),
      quoteAmount: 7_00000000n,
      price: 1_35000000n,
      txHash: "0xtx2",
    };

    applyTradeToCandle(candles, firstTrade);
    applyTradeToCandle(candles, secondTrade);

    const candle = candles.values().next().value;
    expect(candle).toMatchObject({
      open: 1_20000000n,
      high: 1_35000000n,
      low: 1_20000000n,
      close: 1_35000000n,
      volume: 12_00000000n,
    });
  });

  it("fills empty 15m buckets and carries the previous close into the next candle open", () => {
    const rawCandles: MarketCandle[] = [
      {
        time: Date.UTC(2026, 3, 10, 14, 15, 0) / 1000,
        open: 4_848n,
        high: 4_857n,
        low: 4_848n,
        close: 4_857n,
        volume: 100_00000000n,
      },
      {
        time: Date.UTC(2026, 3, 10, 14, 30, 0) / 1000,
        open: 5_032n,
        high: 5_143n,
        low: 4_596n,
        close: 4_596n,
        volume: 540_47000000n,
      },
    ];

    const continuous = buildContinuousCandles(
      rawCandles,
      Date.UTC(2026, 3, 10, 15, 30, 0)
    );

    expect(continuous.map((candle) => candle.time)).toEqual([
      Date.UTC(2026, 3, 10, 14, 15, 0) / 1000,
      Date.UTC(2026, 3, 10, 14, 30, 0) / 1000,
      Date.UTC(2026, 3, 10, 14, 45, 0) / 1000,
      Date.UTC(2026, 3, 10, 15, 0, 0) / 1000,
      Date.UTC(2026, 3, 10, 15, 15, 0) / 1000,
      Date.UTC(2026, 3, 10, 15, 30, 0) / 1000,
    ]);

    expect(continuous[1]).toMatchObject({
      open: 4_857n,
      high: 5_143n,
      low: 4_596n,
      close: 4_596n,
    });
    expect(continuous[2]).toMatchObject({
      open: 4_596n,
      high: 4_596n,
      low: 4_596n,
      close: 4_596n,
      volume: 0n,
    });
    expect(continuous[5]).toMatchObject({
      open: 4_596n,
      high: 4_596n,
      low: 4_596n,
      close: 4_596n,
      volume: 0n,
    });
  });

  it("builds holder rankings while excluding the router balance", () => {
    const balances = new Map<string, bigint>([
      ["0xrouter0000000000000000000000000000000000", 900n],
      ["0x1111111111111111111111111111111111111111", 600n],
      ["0x2222222222222222222222222222222222222222", 400n],
      ["0x3333333333333333333333333333333333333333", 0n],
    ]);

    const holders = buildHolderEntries(
      balances,
      "0xrouter0000000000000000000000000000000000"
    );

    expect(holders).toHaveLength(2);
    expect(holders[0]).toMatchObject({
      rank: 1,
      balance: 600n,
      shareBps: 6000,
    });
    expect(holders[1]).toMatchObject({
      rank: 2,
      balance: 400n,
      shareBps: 4000,
    });
  });

  it("builds top trader rankings from aggregated quote volumes", () => {
    const topTraders = buildTopTraderEntries(
      new Map([
        [
          "0x1111111111111111111111111111111111111111",
          {
            totalTrades: 2,
            buyVolume: 12_00000000n,
            sellVolume: 3_00000000n,
          },
        ],
        [
          "0x2222222222222222222222222222222222222222",
          {
            totalTrades: 1,
            buyVolume: 20_00000000n,
            sellVolume: 0n,
          },
        ],
      ])
    );

    expect(topTraders).toHaveLength(2);
    expect(topTraders[0]).toMatchObject({
      totalTrades: 2,
      buyVolume: 12_00000000n,
      sellVolume: 3_00000000n,
      netQuoteVolume: 9_00000000n,
    });
    expect(topTraders[1]).toMatchObject({
      totalTrades: 1,
      buyVolume: 20_00000000n,
    });
  });
});
