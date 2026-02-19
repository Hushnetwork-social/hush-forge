import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletConnectModal } from "./WalletConnectModal";
import type { InstalledWallet } from "../neo-dapi-adapter";

const wallets: InstalledWallet[] = [
  { type: "NeoLine", name: "NeoLine" },
  { type: "OneGate", name: "OneGate" },
];

describe("WalletConnectModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows installed wallets as buttons", () => {
    render(
      <WalletConnectModal
        installedWallets={wallets}
        onConnect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("NeoLine")).toBeInTheDocument();
    expect(screen.getByText("OneGate")).toBeInTheDocument();
  });

  it("shows install message when no wallets detected", () => {
    render(
      <WalletConnectModal
        installedWallets={[]}
        onConnect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByText(/No Neo wallet detected/i)
    ).toBeInTheDocument();
  });

  it("calls onConnect with wallet type on button click", () => {
    const onConnect = vi.fn();
    render(
      <WalletConnectModal
        installedWallets={wallets}
        onConnect={onConnect}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("NeoLine"));
    expect(onConnect).toHaveBeenCalledWith("NeoLine");
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <WalletConnectModal
        installedWallets={wallets}
        onConnect={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <WalletConnectModal
        installedWallets={wallets}
        onConnect={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows inline error message when error prop is provided", () => {
    render(
      <WalletConnectModal
        installedWallets={wallets}
        onConnect={vi.fn()}
        onClose={vi.fn()}
        error="Connection failed"
      />
    );
    expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
  });
});
