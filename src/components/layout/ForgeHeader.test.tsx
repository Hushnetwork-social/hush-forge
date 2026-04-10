import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForgeHeader } from "./ForgeHeader";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { ConnectionStatus, WalletStore } from "@/modules/forge/wallet-store";

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

function mockWallet(
  address: string | null,
  connectionStatus: ConnectionStatus = "disconnected",
  disconnect = vi.fn()
) {
  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: WalletStore) => unknown) =>
      selector({ address, connectionStatus, disconnect } as unknown as WalletStore)
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

  it("shows disconnect button when connected", () => {
    mockWallet("NXV7ZhHiyM1aHXwvUNBLNbCcFZdTLi1p5f", "connected");
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Disconnect wallet" })).toBeInTheDocument();
  });

  it("calls disconnect when disconnect button is clicked", () => {
    const disconnect = vi.fn();
    mockWallet("NXV7ZhHiyM1aHXwvUNBLNbCcFZdTLi1p5f", "connected", disconnect);
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect wallet" }));
    expect(disconnect).toHaveBeenCalled();
  });

  it("shows Connecting... label and disables button while connecting", () => {
    mockWallet(null, "connecting");
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Connecting..." });
    expect(button).toBeDisabled();
  });

  it("Forge logo links to /markets by default", () => {
    render(<ForgeHeader onConnectClick={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Forge" });
    expect(link).toHaveAttribute("href", "/markets");
  });

  it("renders the optional header slot content", () => {
    render(
      <ForgeHeader onConnectClick={vi.fn()}>
        <div>shell content</div>
      </ForgeHeader>
    );

    expect(screen.getByText("shell content")).toBeInTheDocument();
  });

  it("allows overriding the home link target", () => {
    render(<ForgeHeader onConnectClick={vi.fn()} homeHref="/tokens" />);
    const link = screen.getByRole("link", { name: "Forge" });
    expect(link).toHaveAttribute("href", "/tokens");
  });

});
