import { describe, expect, it } from "vitest";
import {
  formatQuoteAmountSummary,
  formatMarketPrice,
  formatQuoteAmount,
  formatQuoteAmountRounded,
  formatTokenDisplayRounded,
  formatUsdCompactAmount,
  formatUsdPrice,
  marketPriceToUsd,
  quoteAmountToUsd,
} from "./market-formatting";

describe("market-formatting", () => {
  it("keeps quote amounts on the asset-decimal formatter", () => {
    expect(formatQuoteAmount(10000000n, "GAS")).toBe("0.1 GAS");
    expect(formatQuoteAmount(100000000n, "NEO")).toBe("100,000,000 NEO");
    expect(formatQuoteAmountRounded(999_797_70734719n, "GAS", 2)).toBe(
      "999,797.71 GAS"
    );
  });

  it("formats market prices using both quote and token decimals", () => {
    expect(formatMarketPrice(4_500_000_000_000n, "GAS", 8)).toBe("0.0₅4500 GAS");
  });

  it("formats scaled market prices normally when they are not ultra-small", () => {
    expect(formatMarketPrice(123_456_000_000_000n, "GAS", 8)).toBe("0.00012345 GAS");
    expect(formatMarketPrice(1_100_000_000_000_000_000n, "GAS", 8)).toBe("1.1 GAS");
  });

  it("converts native quote values into USD display helpers", () => {
    expect(marketPriceToUsd(4_500_000_000_000n, "GAS", 8, 1.72)).toBeCloseTo(0.00000774);
    expect(quoteAmountToUsd(450_000_000_000n, "GAS", 1.72)).toBeCloseTo(7740);
    expect(formatUsdPrice(0.00000774)).toBe("$0.00000774");
    expect(formatUsdCompactAmount(7740)).toBe("$7.7K");
    expect(formatQuoteAmountSummary(450_000_000_000n, "GAS")).toBe("4,500 GAS");
  });

  it("rounds token displays to a fixed number of decimal places", () => {
    expect(formatTokenDisplayRounded(21_797_666_36748305n, 8, "ONE")).toBe(
      "21,797,666.37 ONE"
    );
    expect(formatTokenDisplayRounded(21_579_689_70380821n, 8, "ONE")).toBe(
      "21,579,689.70 ONE"
    );
  });
});
