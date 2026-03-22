import { describe, expect, it } from "vitest";
import {
  buildBurnConfirmationSummary,
  formatBasisPointsAsPercent,
  formatDatoshiAsGas,
  getTokenEconomicsView,
  parseTokenAmountInput,
} from "./token-economics-logic";
import type { TokenInfo } from "./types";

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "Hush",
    creator: "0xcreator",
    supply: 1_000_000_000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    burnRate: 0,
    creatorFeeRate: 0,
    platformFeeRate: 0,
    ...overrides,
  };
}

describe("token-economics-logic", () => {
  it("formats basis points as percent with two decimals", () => {
    expect(formatBasisPointsAsPercent(125)).toBe("1.25%");
  });

  it("formats datoshi as trimmed GAS while preserving zero", () => {
    expect(formatDatoshiAsGas(0n)).toBe("0 GAS");
    expect(formatDatoshiAsGas(1_500_000n)).toBe("0.015 GAS");
  });

  it("returns visible zero-value economics for Forge-created tokens", () => {
    const economics = getTokenEconomicsView(makeToken());

    expect(economics).not.toBeNull();
    expect(economics?.burnRateDisplay).toBe("0.00%");
    expect(economics?.creatorFeeDisplay).toBe("0 GAS");
    expect(economics?.platformFeeDisplay).toBe("0 GAS");
  });

  it("returns null economics for non-factory tokens", () => {
    expect(getTokenEconomicsView(makeToken({ creator: null }))).toBeNull();
  });

  it("parses decimal token input using token decimals", () => {
    expect(parseTokenAmountInput("12.5", 8)).toBe(1_250_000_000n);
    expect(parseTokenAmountInput("12.123456789", 8)).toBeNull();
  });

  it("builds burn confirmation summary from token economics", () => {
    const summary = buildBurnConfirmationSummary(
      makeToken({ creatorFeeRate: 1_500_000, platformFeeRate: 2_500_000 }),
      1_250_000_000n
    );

    expect(summary).not.toBeNull();
    expect(summary?.amountDisplay).toBe("12.5");
    expect(summary?.creatorFeeDisplay).toBe("0.015 GAS");
    expect(summary?.platformFeeDisplay).toBe("0.025 GAS");
    expect(summary?.networkFeeDisclaimer).toMatch(/not part of token taxes/i);
  });
});
