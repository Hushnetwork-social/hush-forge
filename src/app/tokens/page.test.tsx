import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TokensPage from "./page";

// ── Mock all hooks and stores ──────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useTokenPolling", () => ({
  useTokenPolling: vi.fn(),
}));

vi.mock("@/modules/forge/token-store", () => ({
  useTokenStore: vi.fn(),
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

vi.mock("@/modules/forge/components/WalletPanel", () => ({
  WalletPanel: () => <div data-testid="wallet-panel" />,
}));

vi.mock("@/modules/forge/components/TokenGrid", () => ({
  TokenGrid: () => <div data-testid="token-grid" />,
}));

vi.mock("@/modules/forge/components/ForgeOverlay", () => ({
  ForgeOverlay: ({
    onClose,
    onTxSubmitted,
  }: {
    onClose: () => void;
    onTxSubmitted: (txHash: string) => void;
  }) => (
    <div role="dialog" aria-label="Forge a Token">
      <button onClick={onClose}>Cancel</button>
      <button onClick={() => onTxSubmitted("0xtxhash")}>FORGE</button>
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
  ForgeSuccessToast: ({ onDismiss }: { onDismiss: () => void }) => (
    <div data-testid="success-toast">
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
import { useTokenStore } from "@/modules/forge/token-store";
import type { TokenStore } from "@/modules/forge/token-store";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { WalletStore } from "@/modules/forge/wallet-store";

function setupMocks({
  address = null as string | null,
  connectionStatus = "disconnected" as
    | "disconnected"
    | "connecting"
    | "connected"
    | "error",
} = {}) {
  vi.mocked(useWallet).mockReturnValue({
    walletType: null,
    address,
    balances: [],
    connectionStatus,
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

  vi.mocked(useTokenStore).mockImplementation(
    (selector: (s: TokenStore) => unknown) =>
      selector({
        loadTokensForAddress: vi.fn().mockResolvedValue(undefined),
        loadWalletHeldTokens: vi.fn().mockResolvedValue(undefined),
      } as TokenStore)
  );

  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: WalletStore) => unknown) =>
      selector({ address, connectionStatus } as WalletStore)
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TokensPage", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("renders WalletPanel and TokenGrid", () => {
    render(<TokensPage />);
    expect(screen.getByTestId("wallet-panel")).toBeInTheDocument();
    expect(screen.getByTestId("token-grid")).toBeInTheDocument();
  });

  it("ForgeOverlay is not visible on load", () => {
    render(<TokensPage />);
    expect(screen.queryByRole("dialog", { name: "Forge a Token" })).not.toBeInTheDocument();
  });

  it("Forge Token button is shown when wallet is connected", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    expect(screen.getByText("🔥 Forge Token")).toBeInTheDocument();
  });

  it("Forge Token button is not shown when wallet is disconnected", () => {
    render(<TokensPage />);
    expect(screen.queryByText("🔥 Forge Token")).not.toBeInTheDocument();
  });

  it("clicking Forge Token shows the ForgeOverlay", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    fireEvent.click(screen.getByText("🔥 Forge Token"));
    expect(screen.getByRole("dialog", { name: "Forge a Token" })).toBeInTheDocument();
  });

  it("ForgeOverlay Cancel returns to dashboard", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    fireEvent.click(screen.getByText("🔥 Forge Token"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog", { name: "Forge a Token" })).not.toBeInTheDocument();
  });

  it("WaitingOverlay appears after wallet signs", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    fireEvent.click(screen.getByText("🔥 Forge Token"));
    fireEvent.click(screen.getByText("FORGE"));
    expect(
      screen.getByRole("status", { name: "Waiting for transaction" })
    ).toBeInTheDocument();
    expect(screen.getByText("Forging your token…")).toBeInTheDocument();
  });

  it("WalletConnectModal opens from header Connect Wallet click", () => {
    render(<TokensPage />);
    fireEvent.click(screen.getByText("Connect Wallet"));
    expect(screen.getByRole("dialog", { name: "Connect Wallet" })).toBeInTheDocument();
  });
});
