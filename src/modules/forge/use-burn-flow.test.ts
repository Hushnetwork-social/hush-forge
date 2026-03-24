import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBurnFlow } from "./use-burn-flow";
import type { TokenInfo, WalletBalance } from "./types";

vi.mock("./neo-dapi-adapter", () => ({
  invokeBurn: vi.fn(),
}));

import { invokeBurn } from "./neo-dapi-adapter";

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "Hush",
    creator: "0xcreator",
    supply: 100_000_000_000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    burnRate: 100,
    creatorFeeRate: 1_500_000,
    platformFeeRate: 2_500_000,
    ...overrides,
  };
}

function makeBalance(overrides: Partial<WalletBalance> = {}): WalletBalance {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    amount: 5_000_000_000n,
    decimals: 8,
    displayAmount: "50.00000000",
    ...overrides,
  };
}

describe("useBurnFlow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exposes a burn summary with configured taxes", () => {
    const { result } = renderHook(() =>
      useBurnFlow(makeToken(), makeBalance())
    );

    act(() => result.current.setAmountInput("12.5"));

    expect(result.current.available).toBe(true);
    expect(result.current.validationError).toBeNull();
    expect(result.current.confirmation?.amountDisplay).toBe("12.5");
    expect(result.current.confirmation?.creatorFeeDisplay).toBe("0.015 GAS");
    expect(result.current.confirmation?.platformFeeDisplay).toBe("0.025 GAS");
  });

  it("blocks amounts above the current balance", () => {
    const { result } = renderHook(() =>
      useBurnFlow(makeToken(), makeBalance({ amount: 1_000_000_000n }))
    );

    act(() => result.current.setAmountInput("20"));

    expect(result.current.canSubmit).toBe(false);
    expect(result.current.validationError).toBe(
      "Burn amount cannot exceed the current wallet balance."
    );
  });

  it("submits a valid burn using raw token units", async () => {
    vi.mocked(invokeBurn).mockResolvedValue("0xtxhash");

    const { result } = renderHook(() =>
      useBurnFlow(makeToken(), makeBalance())
    );

    act(() => result.current.setAmountInput("12.5"));

    await act(async () => {
      await result.current.submit();
    });

    expect(invokeBurn).toHaveBeenCalledWith("0xtoken", 1_250_000_000n);
    expect(result.current.submittedTxHash).toBe("0xtxhash");
    expect(result.current.submitError).toBeNull();
  });

  it("maps wallet rejection into a UI-safe error message", async () => {
    const rejection = new Error("cancelled");
    rejection.name = "WalletRejectedError";
    vi.mocked(invokeBurn).mockRejectedValue(rejection);

    const { result } = renderHook(() =>
      useBurnFlow(makeToken(), makeBalance())
    );

    act(() => result.current.setAmountInput("12.5"));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.submittedTxHash).toBeNull();
    expect(result.current.submitError).toBe("Transaction cancelled.");
  });

  it("marks non-factory tokens as unavailable", () => {
    const { result } = renderHook(() =>
      useBurnFlow(makeToken({ creator: null }), makeBalance())
    );

    expect(result.current.available).toBe(false);
    expect(result.current.confirmation).toBeNull();
    expect(result.current.validationError).toBe(
      "Burn is unavailable for the selected token."
    );
  });
});
