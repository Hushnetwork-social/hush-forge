import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransferFlow } from "./use-transfer-flow";
import type { TokenInfo, WalletBalance } from "./types";

vi.mock("./neo-dapi-adapter", () => ({
  invokeTokenTransfer: vi.fn(),
}));

vi.mock("./transfer-quote-service", () => ({
  quoteTokenTransfer: vi.fn(),
}));

import { invokeTokenTransfer } from "./neo-dapi-adapter";
import { quoteTokenTransfer } from "./transfer-quote-service";

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
    burnRate: 200,
    creatorFeeRate: 500_000,
    platformFeeRate: 1_000_000,
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

describe("useTransferFlow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(quoteTokenTransfer).mockResolvedValue({
      grossAmountRaw: 1_000_000_000n,
      recipientAmountRaw: 980_000_000n,
      transferBurnAmountRaw: 20_000_000n,
      totalTokenBurnedRaw: 20_000_000n,
      platformFeeDatoshi: 1_000_000n,
      creatorFeeDatoshi: 500_000n,
      totalGasFeeDatoshi: 1_500_000n,
      isMint: false,
      isDirectBurn: false,
    });
  });

  it("loads a transfer quote and exposes a confirmation summary", async () => {
    const token = makeToken();
    const balance = makeBalance();
    const { result } = renderHook(() =>
      useTransferFlow(token, balance, "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c")
    );

    act(() => {
      result.current.setRecipientInput("NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU");
      result.current.setAmountInput("10");
    });

    await waitFor(() => expect(result.current.quoteLoading).toBe(false));

    expect(result.current.validationError).toBeNull();
    expect(result.current.confirmation?.recipientAmountDisplay).toBe("9.8");
    expect(result.current.confirmation?.transferBurnAmountDisplay).toBe("0.2");
    expect(result.current.confirmation?.creatorFeeDisplay).toBe("0.005 GAS");
    expect(result.current.confirmation?.platformFeeDisplay).toBe("0.01 GAS");
    expect(result.current.confirmation?.totalGasFeeDisplay).toBe("0.015 GAS");
  });

  it("blocks invalid recipient addresses", () => {
    const token = makeToken();
    const balance = makeBalance();
    const { result } = renderHook(() =>
      useTransferFlow(token, balance, "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c")
    );

    act(() => {
      result.current.setRecipientInput("bad-address");
      result.current.setAmountInput("10");
    });

    expect(result.current.canSubmit).toBe(false);
    expect(result.current.validationError).toBe(
      "Enter a valid Neo N3 recipient address."
    );
  });

  it("submits a valid transfer using raw token units", async () => {
    vi.mocked(invokeTokenTransfer).mockResolvedValue("0xtxhash");
    const token = makeToken();
    const balance = makeBalance();

    const { result } = renderHook(() =>
      useTransferFlow(token, balance, "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c")
    );

    act(() => {
      result.current.setRecipientInput("NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU");
      result.current.setAmountInput("10");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(invokeTokenTransfer).toHaveBeenCalledWith(
      "0xtoken",
      "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU",
      1_000_000_000n
    );
    expect(result.current.submittedTxHash).toBe("0xtxhash");
    expect(result.current.submitError).toBeNull();
  });

  it("marks non-factory tokens as unavailable", () => {
    const token = makeToken({ creator: null });
    const balance = makeBalance();
    const { result } = renderHook(() =>
      useTransferFlow(token, balance, "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c")
    );

    expect(result.current.available).toBe(false);
    expect(result.current.confirmation).toBeNull();
    expect(result.current.validationError).toBe(
      "Transfer is unavailable for the selected token."
    );
  });
});
