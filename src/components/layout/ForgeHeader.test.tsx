import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForgeHeader } from "./ForgeHeader";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { ConnectionStatus } from "@/modules/forge/wallet-store";

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

function mockWallet(
  address: string | null,
  connectionStatus: ConnectionStatus = "disconnected"
) {
  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: { address: string | null; connectionStatus: ConnectionStatus }) => unknown) =>
      selector({ address, connectionStatus })
  );
}

describe("ForgeHeader", () => {
  beforeEach(() => {
    mockWallet(null, "disconnected");
  });

  it("shows Connect Wallet button when disconnected", () => {
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
  });

  it("calls onConnectClick when Connect Wallet button is clicked", () => {
    const onConnectClick = vi.fn();
    render(<ForgeHeader onConnectClick={onConnectClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));
    expect(onConnectClick).toHaveBeenCalled();
  });

  it("shows truncated address when connected", () => {
    mockWallet("NXV7ZhHiyM1aHXwvUNBLNbCcFZdTLi1p5f", "connected");
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    expect(screen.getByText("NXV7Zh...1p5f")).toBeInTheDocument();
  });

  it("does not show Connect Wallet button when connected", () => {
    mockWallet("NXV7ZhHiyM1aHXwvUNBLNbCcFZdTLi1p5f", "connected");
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
  });

  it("shows Connecting… label and disables button while connecting", () => {
    mockWallet(null, "connecting");
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Connecting…" });
    expect(btn).toBeDisabled();
  });

  it("Forge logo links to /tokens", () => {
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Forge" });
    expect(link).toHaveAttribute("href", "/tokens");
  });
});
