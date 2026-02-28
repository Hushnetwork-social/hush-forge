import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TokenDetailPage from "./page";
import type { TokenInfo } from "@/modules/forge/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ hash: "0xabc123" }),
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useTokenDetail", () => ({
  useTokenDetail: vi.fn(),
}));

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

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
    onTxSubmitted,
  }: {
    contractHash: string;
    onTxSubmitted: (txHash: string, message: string) => void;
  }) => (
    <div data-testid="token-detail" data-hash={contractHash}>
      <button onClick={() => onTxSubmitted("0xupdatehash", "Setting burn rate...")}>
        Submit TX
      </button>
    </div>
  ),
}));

vi.mock("@/modules/forge/components/PendingTxProvider", () => ({
  usePendingTx: vi.fn(),
}));

vi.mock("@/modules/forge/components/WalletConnectModal", () => ({
  WalletConnectModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Connect Wallet">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useTokenDetail } from "@/modules/forge/hooks/useTokenDetail";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { WalletStore } from "@/modules/forge/wallet-store";
import { usePendingTx } from "@/modules/forge/components/PendingTxProvider";

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

  vi.mocked(usePendingTx).mockReturnValue({
    setPendingTx: vi.fn(),
    clearPendingTx: vi.fn(),
  });
}

describe("TokenDetailPage", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("renders TokenDetail with contractHash from URL", () => {
    render(<TokenDetailPage />);
    const detail = screen.getByTestId("token-detail");
    expect(detail).toHaveAttribute("data-hash", "0xabc123");
  });

  it("submete tx pendente para o provider global após ação no token", () => {
    const setPendingTx = vi.fn();
    vi.mocked(usePendingTx).mockReturnValue({
      setPendingTx,
      clearPendingTx: vi.fn(),
    });
    render(<TokenDetailPage />);
    fireEvent.click(screen.getByText("Submit TX"));
    expect(setPendingTx).toHaveBeenCalledWith({
      txHash: "0xupdatehash",
      message: "Setting burn rate...",
      targetTokenHash: "0xabc123",
    });
  });
});
