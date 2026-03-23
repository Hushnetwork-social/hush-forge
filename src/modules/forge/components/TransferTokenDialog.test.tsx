import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransferTokenDialog } from "./TransferTokenDialog";
import type { TokenInfo, WalletBalance } from "../types";

vi.mock("../neo-dapi-adapter", () => ({
  invokeTokenTransfer: vi.fn(),
}));

vi.mock("../transfer-quote-service", () => ({
  quoteTokenTransfer: vi.fn(),
}));

import { invokeTokenTransfer } from "../neo-dapi-adapter";
import { quoteTokenTransfer } from "../transfer-quote-service";

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

describe("TransferTokenDialog", () => {
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

  it("renders the pre-submit transfer tax summary for the selected token", async () => {
    render(
      <TransferTokenDialog
        token={makeToken()}
        balance={makeBalance()}
        connectedAddress="NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Recipient address"), {
      target: { value: "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU" },
    });
    fireEvent.change(screen.getByLabelText("Amount to transfer"), {
      target: { value: "10" },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Transfer economics summary")).toContainHTML("0.015 GAS")
    );

    expect(screen.getByRole("dialog", { name: "Transfer HUSH" })).toBeInTheDocument();
    expect(screen.getByText("Recipient receives")).toBeInTheDocument();
    expect(screen.getByText("9.8 HUSH")).toBeInTheDocument();
    expect(screen.getByText("Transfer burn")).toBeInTheDocument();
    expect(screen.getByText("0.2 HUSH")).toBeInTheDocument();
    expect(screen.getByText("Creator fee")).toBeInTheDocument();
    expect(screen.getByText("0.005 GAS")).toBeInTheDocument();
    expect(screen.getByText("Platform fee")).toBeInTheDocument();
    expect(screen.getByText("0.01 GAS")).toBeInTheDocument();
    expect(screen.getByText("Total token GAS taxes")).toBeInTheDocument();
  });

  it("shows a validation error when the entered amount exceeds the wallet balance", () => {
    render(
      <TransferTokenDialog
        token={makeToken()}
        balance={makeBalance({
          amount: 1_000_000_000n,
          displayAmount: "10.00000000",
        })}
        connectedAddress="NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Recipient address"), {
      target: { value: "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU" },
    });
    fireEvent.change(screen.getByLabelText("Amount to transfer"), {
      target: { value: "20" },
    });

    expect(
      screen.getByText("Transfer amount cannot exceed the current wallet balance.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  });

  it("submits transfer and hands the tx hash to the pending flow", async () => {
    vi.mocked(invokeTokenTransfer).mockResolvedValue("0xtxhash");
    const onClose = vi.fn();
    const onTxSubmitted = vi.fn();

    render(
      <TransferTokenDialog
        token={makeToken()}
        balance={makeBalance()}
        connectedAddress="NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c"
        onClose={onClose}
        onTxSubmitted={onTxSubmitted}
      />
    );

    fireEvent.change(screen.getByLabelText("Recipient address"), {
      target: { value: "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU" },
    });
    fireEvent.change(screen.getByLabelText("Amount to transfer"), {
      target: { value: "10" },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    await waitFor(() =>
      expect(onTxSubmitted).toHaveBeenCalledWith(
        "0xtxhash",
        "Waiting for HUSH transfer confirmation..."
      )
    );
    expect(onClose).toHaveBeenCalled();
  });
});
