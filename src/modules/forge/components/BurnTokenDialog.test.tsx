import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BurnTokenDialog } from "./BurnTokenDialog";
import type { TokenInfo, WalletBalance } from "../types";

vi.mock("../neo-dapi-adapter", () => ({
  invokeBurn: vi.fn(),
}));

import { invokeBurn } from "../neo-dapi-adapter";

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

describe("BurnTokenDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the pre-submit tax summary for the selected token", () => {
    render(
      <BurnTokenDialog
        token={makeToken()}
        balance={makeBalance()}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Burn HUSH" })).toBeInTheDocument();
    expect(screen.getByLabelText("Burn economics summary")).toBeInTheDocument();
    expect(screen.getByText("Creator fee")).toBeInTheDocument();
    expect(screen.getByText("0.015 GAS")).toBeInTheDocument();
    expect(screen.getByText("Platform fee")).toBeInTheDocument();
    expect(screen.getByText("0.025 GAS")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Network GAS fees are charged separately by the Neo chain and are not part of token taxes."
      )
    ).toBeInTheDocument();
  });

  it("shows a validation error when the entered amount exceeds the wallet balance", () => {
    render(
      <BurnTokenDialog
        token={makeToken()}
        balance={makeBalance({
          amount: 1_000_000_000n,
          displayAmount: "10.00000000",
        })}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Amount to burn"), {
      target: { value: "20" },
    });

    expect(
      screen.getByText("Burn amount cannot exceed the current wallet balance.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Burn" })).toBeDisabled();
  });

  it("submits burn and hands the tx hash to the pending flow", async () => {
    vi.mocked(invokeBurn).mockResolvedValue("0xtxhash");
    const onClose = vi.fn();
    const onTxSubmitted = vi.fn();

    render(
      <BurnTokenDialog
        token={makeToken()}
        balance={makeBalance()}
        onClose={onClose}
        onTxSubmitted={onTxSubmitted}
      />
    );

    fireEvent.change(screen.getByLabelText("Amount to burn"), {
      target: { value: "12.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Burn" }));

    await waitFor(() =>
      expect(onTxSubmitted).toHaveBeenCalledWith(
        "0xtxhash",
        "Waiting for HUSH burn confirmation..."
      )
    );
    expect(onClose).toHaveBeenCalled();
  });
});
