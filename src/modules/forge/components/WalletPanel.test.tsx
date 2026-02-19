import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletPanel } from "./WalletPanel";
import type { WalletBalance } from "../types";

function makeBalance(symbol: string, amount: bigint): WalletBalance {
  return {
    contractHash: `0x${symbol.toLowerCase()}`,
    symbol,
    amount,
    decimals: 8,
    displayAmount: (Number(amount) / 1e8).toFixed(8),
  };
}

describe("WalletPanel", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("shows connect button when disconnected", () => {
    render(
      <WalletPanel
        connectionStatus="disconnected"
        address={null}
        balances={[]}
        onConnectClick={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("calls onConnectClick when Connect Wallet button is clicked", () => {
    const onConnectClick = vi.fn();
    render(
      <WalletPanel
        connectionStatus="disconnected"
        address={null}
        balances={[]}
        onConnectClick={onConnectClick}
        onDisconnect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Connect Wallet"));
    expect(onConnectClick).toHaveBeenCalled();
  });

  it("shows truncated address when connected", () => {
    render(
      <WalletPanel
        connectionStatus="connected"
        address="NwXxxxxxxxxxxxxxxxxxxxxxxxxzzzz"
        balances={[]}
        onConnectClick={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );
    expect(screen.getByText("NwXx...zzzz")).toBeInTheDocument();
  });

  it("shows NEP-17 balances when connected", () => {
    render(
      <WalletPanel
        connectionStatus="connected"
        address="NwAddr"
        balances={[
          makeBalance("NEO", 100_00000000n),
          makeBalance("GAS", 47_38000000n),
        ]}
        onConnectClick={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );
    expect(screen.getByText("NEO")).toBeInTheDocument();
    expect(screen.getByText("GAS")).toBeInTheDocument();
  });

  it("shows '+N more' when more than 5 balances", () => {
    const manyBalances = Array.from({ length: 8 }, (_, i) =>
      makeBalance(`TK${i}`, 100n)
    );
    render(
      <WalletPanel
        connectionStatus="connected"
        address="NwAddr"
        balances={manyBalances}
        onConnectClick={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );
    expect(screen.getByText("+3 more…")).toBeInTheDocument();
  });

  it("shows connecting spinner while connecting", () => {
    render(
      <WalletPanel
        connectionStatus="connecting"
        address={null}
        balances={[]}
        onConnectClick={vi.fn()}
        onDisconnect={vi.fn()}
      />
    );
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });
});
