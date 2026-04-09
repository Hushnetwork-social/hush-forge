import { describe, expect, it } from "vitest";
import {
  calculateExecutionPriceRaw,
  calculateMinimumOutput,
  calculatePriceImpactBps,
  formatAmountForInput,
  formatPriceImpactBps,
  getQuoteAssetContractHash,
  getSellPresetAmount,
  parseSlippagePercentInput,
  parseTradeAmountInput,
} from "./market-trade-logic";

describe("market-trade-logic", () => {
  it("parses buy amounts using quote-asset decimals", () => {
    expect(parseTradeAmountInput("1.25", "buy", 8, "GAS")).toBe(125_000_000n);
    expect(parseTradeAmountInput("15", "buy", 8, "NEO")).toBe(15n);
  });

  it("parses sell amounts using token decimals", () => {
    expect(parseTradeAmountInput("12.5", "sell", 8, "GAS")).toBe(1_250_000_000n);
  });

  it("parses slippage into basis points", () => {
    expect(parseSlippagePercentInput("1")).toEqual({ bps: 100, reason: null });
    expect(parseSlippagePercentInput("1.25")).toEqual({ bps: 125, reason: null });
    expect(parseSlippagePercentInput("120")).toEqual({
      bps: null,
      reason: "Slippage cannot exceed 100%.",
    });
  });

  it("calculates minimum output from slippage bps", () => {
    expect(calculateMinimumOutput(10_000n, 100)).toBe(9_900n);
  });

  it("derives effective execution price and price impact", () => {
    const executionPrice = calculateExecutionPriceRaw(125_000_000n, 100_000_000_000n, 8);
    expect(executionPrice).toBe(125_000n);
    expect(calculatePriceImpactBps(100_000n, executionPrice)).toBe(2500);
    expect(formatPriceImpactBps(2500)).toBe("25.00%");
  });

  it("formats raw preset amounts without separators for inputs", () => {
    expect(formatAmountForInput(12_500_000_000n, 8)).toBe("125");
  });

  it("derives sell preset amounts from the current balance", () => {
    expect(getSellPresetAmount(1_000n, 25)).toBe(250n);
  });

  it("maps quote assets to the correct native contract hash", () => {
    expect(getQuoteAssetContractHash("GAS")).toBe(
      "0xd2a4cff31913016155e38e474a2c06d08be276cf"
    );
    expect(getQuoteAssetContractHash("NEO")).toBe(
      "0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5"
    );
  });
});
