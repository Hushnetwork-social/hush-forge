import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TokenDetailPage from "./page";
import type { TokenInfo } from "@/modules/forge/types";

// ── Mock all hooks ─────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ hash: "0xabc123" }),
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useTokenPolling", () => ({
  useTokenPolling: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useTokenDetail", () => ({
  useTokenDetail: vi.fn(),
}));

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

// ── Mock all components ────────────────────────────────────────────────────

vi.mock("@/components/layout/ForgeHeader", () => ({
  ForgeHeader: ({ onConnectClick }: { onConnectClick: () => void }) => (
    <header data-testid="forge-header">
      <button onClick={onConnectClick}>Connect Wallet</button>
    </header>
  ),
}));

vi.mock("@/modules/forge/components/TokenDetail", () => ({
  TokenDetail: ({
    contractHash,
    onUpdateClick,
  }: {
    contractHash: string;
    onUpdateClick?: () => void;
  }) => (
    <div data-testid="token-detail" data-hash={contractHash}>
      <button onClick={onUpdateClick}>Update Token</button>
    </div>
  ),
}));

vi.mock("@/modules/forge/components/UpdateOverlay", () => ({
  UpdateOverlay: ({
    onClose,
    onTxSubmitted,
  }: {
    onClose: () => void;
    onTxSubmitted: (txHash: string) => void;
  }) => (
    <div role="dialog" aria-label="Update Token">
      <button onClick={onClose}>Cancel</button>
      <button onClick={() => onTxSubmitted("0xupdatehash")}>Update</button>
    </div>
  ),
}));

vi.mock("@/modules/forge/components/WaitingOverlay", () => ({
  WaitingOverlay: ({ message }: { message: string }) => (
    <div role="status" aria-label="Waiting for transaction">
      {message}
    </div>
  ),
}));

vi.mock("@/modules/forge/components/ForgeToaster", () => ({
  ForgeSuccessToast: ({
    symbol,
    onDismiss,
  }: {
    symbol: string;
    onDismiss: () => void;
  }) => (
    <div data-testid="success-toast">
      {symbol}
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  ),
  ForgeErrorToast: ({
    message,
    onDismiss,
  }: {
    message: string;
    onDismiss: () => void;
  }) => (
    <div data-testid="error-toast">
      {message}
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  ),
}));

vi.mock("@/modules/forge/components/WalletConnectModal", () => ({
  WalletConnectModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Connect Wallet">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// ── Test fixtures ──────────────────────────────────────────────────────────

import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useTokenPolling } from "@/modules/forge/hooks/useTokenPolling";
import { useTokenDetail } from "@/modules/forge/hooks/useTokenDetail";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { WalletStore } from "@/modules/forge/wallet-store";

const mockToken: TokenInfo = {
  contractHash: "0xabc123",
  symbol: "TST",
  name: "Test Token",
  creator: "NwMe",
  supply: 1_000_00000000n,
  decimals: 8,
  mode: "community",
  tier: 0,
  createdAt: 1_000_000,
};

function setupMocks({ token = mockToken as TokenInfo | null } = {}) {
  vi.mocked(useWallet).mockReturnValue({
    walletType: null,
    address: null,
    balances: [],
    connectionStatus: "disconnected",
    errorMessage: null,
    installedWallets: [],
    gasBalance: 0n,
    connect: vi.fn(),
    disconnect: vi.fn(),
    refreshBalances: vi.fn(),
  });

  vi.mocked(useTokenPolling).mockReturnValue({
    status: "confirming",
    contractHash: null,
    error: null,
  });

  vi.mocked(useTokenDetail).mockReturnValue({
    token,
    loading: false,
    error: null,
    isOwnToken: false,
    isUpgradeable: false,
  });

  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: WalletStore) => unknown) =>
      selector({ address: null, connectionStatus: "disconnected" } as WalletStore)
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TokenDetailPage", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("renders TokenDetail with contractHash from URL", () => {
    render(<TokenDetailPage />);
    const detail = screen.getByTestId("token-detail");
    expect(detail).toHaveAttribute("data-hash", "0xabc123");
  });

  it("UpdateOverlay is not visible initially", () => {
    render(<TokenDetailPage />);
    expect(
      screen.queryByRole("dialog", { name: "Update Token" })
    ).not.toBeInTheDocument();
  });

  it("clicking Update Token opens the UpdateOverlay", () => {
    render(<TokenDetailPage />);
    fireEvent.click(screen.getByText("Update Token"));
    expect(
      screen.getByRole("dialog", { name: "Update Token" })
    ).toBeInTheDocument();
  });

  it("UpdateOverlay Cancel returns to detail view", () => {
    render(<TokenDetailPage />);
    fireEvent.click(screen.getByText("Update Token"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(
      screen.queryByRole("dialog", { name: "Update Token" })
    ).not.toBeInTheDocument();
  });

  it("WaitingOverlay appears after update TX is submitted", () => {
    render(<TokenDetailPage />);
    fireEvent.click(screen.getByText("Update Token"));
    fireEvent.click(screen.getByText("Update"));
    expect(
      screen.getByRole("status", { name: "Waiting for transaction" })
    ).toBeInTheDocument();
    expect(screen.getByText("Updating your token…")).toBeInTheDocument();
  });
});
