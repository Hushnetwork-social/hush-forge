import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UpdateOverlay } from "./UpdateOverlay";
import { invokeUpdate } from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";

vi.mock("../neo-dapi-adapter", () => ({
  invokeUpdate: vi.fn(),
  WalletRejectedError: class WalletRejectedError extends Error {
    constructor(message = "User rejected the transaction") {
      super(message);
      this.name = "WalletRejectedError";
    }
  },
}));

vi.mock("../forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
  NEOTUBE_BASE_URL: "https://testnet.neotube.io",
}));

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "HushNetwork Token",
    creator: "NwCreator",
    supply: 10_000_000_00000000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe("UpdateOverlay", () => {
  beforeEach(() => {
    vi.mocked(invokeUpdate).mockResolvedValue("0xtx456");
  });

  it("pre-fills Name field from token", () => {
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(
      screen.getByDisplayValue("HushNetwork Token")
    ).toBeInTheDocument();
  });

  it("pre-fills Symbol field from token", () => {
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue("HUSH")).toBeInTheDocument();
  });

  it("shows supply and decimals as read-only", () => {
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    const readOnlyLabels = screen.getAllByText(/read-only/i);
    expect(readOnlyLabels.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onTxSubmitted with txHash on success", async () => {
    const onTxSubmitted = vi.fn();
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={vi.fn()}
        onTxSubmitted={onTxSubmitted}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Update Token/i }));
    await waitFor(() =>
      expect(onTxSubmitted).toHaveBeenCalledWith("0xtx456")
    );
  });

  it("shows inline error on wallet rejection", async () => {
    const { WalletRejectedError } = await import("../neo-dapi-adapter");
    vi.mocked(invokeUpdate).mockRejectedValue(new WalletRejectedError());
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Update Token/i }));
    await waitFor(() =>
      expect(screen.getByText(/Transaction cancelled/i)).toBeInTheDocument()
    );
  });

  it("Escape closes when not submitting", () => {
    const onClose = vi.fn();
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={onClose}
        onTxSubmitted={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows info note about on-chain rejection", () => {
    render(
      <UpdateOverlay
        token={makeToken()}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Fields rejected by the contract/i)
    ).toBeInTheDocument();
  });
});
