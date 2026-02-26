import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UpdateOverlay } from "./UpdateOverlay";
import type { TokenInfo } from "../types";

vi.mock("../neo-dapi-adapter", () => ({}));

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

  it("shows deprecation message when submit is clicked", async () => {
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
      expect(screen.getByText(/Token Administration Panel/i)).toBeInTheDocument()
    );
    expect(onTxSubmitted).not.toHaveBeenCalled();
  });

  it("does not call onTxSubmitted after clicking submit (feature replaced)", async () => {
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
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
    expect(onTxSubmitted).not.toHaveBeenCalled();
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
