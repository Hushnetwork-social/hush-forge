import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import TokensPage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/tokens",
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useFactoryDeployment", () => ({
  useFactoryDeployment: vi.fn(),
}));

vi.mock("@/modules/forge/token-store", () => ({
  useTokenStore: vi.fn(),
}));

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

vi.mock("@/components/layout/ForgeHeader", () => ({
  ForgeHeader: ({
    onConnectClick,
    children,
  }: {
    onConnectClick: () => void;
    children?: ReactNode;
  }) => (
    <header data-testid="forge-header">
      <button onClick={onConnectClick}>Connect Wallet</button>
      {children}
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
import { useFactoryDeployment } from "@/modules/forge/hooks/useFactoryDeployment";
import type { FactoryDeployStatus } from "@/modules/forge/hooks/useFactoryDeployment";
import { useTokenStore } from "@/modules/forge/token-store";
import type { TokenStore } from "@/modules/forge/token-store";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { WalletStore } from "@/modules/forge/wallet-store";
import { usePendingTx } from "@/modules/forge/components/PendingTxProvider";

function setupMocks({
  address = null as string | null,
  connectionStatus = "disconnected" as
    | "disconnected"
    | "connecting"
    | "connected"
    | "error",
  factoryStatus = "deployed" as FactoryDeployStatus,
} = {}) {
  pushMock.mockReset();

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

  vi.mocked(useFactoryDeployment).mockReturnValue({
    status: factoryStatus,
    factoryHash: factoryStatus === "deployed" ? "0xfactory" : "",
    deployError: null,
    deploy: vi.fn(),
    initialize: vi.fn(),
    recheck: vi.fn(),
  });

  vi.mocked(usePendingTx).mockReturnValue({
    setPendingTx: vi.fn(),
    clearPendingTx: vi.fn(),
  });

  vi.mocked(useTokenStore).mockImplementation(
    (selector: (s: TokenStore) => unknown) =>
      selector({
        loadTokensForAddress: vi.fn().mockResolvedValue(undefined),
        loadWalletHeldTokens: vi.fn().mockResolvedValue(undefined),
        tokens: [],
        ownTokenHashes: new Set(),
        activeTab: "all",
        searchQuery: "",
        loadingStatus: "idle",
        errorMessage: null,
      } as unknown as TokenStore)
  );

  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: WalletStore) => unknown) =>
      selector({ address, connectionStatus } as WalletStore)
  );
}

describe("TokensPage", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("renders WalletPanel and TokenGrid", () => {
    render(<TokensPage />);
    expect(screen.getByTestId("wallet-panel")).toBeInTheDocument();
    expect(screen.getByTestId("token-grid")).toBeInTheDocument();
  });

  it("renders route-backed shell tabs with Tokens active", () => {
    render(<TokensPage />);

    expect(screen.getByRole("link", { name: "Pairs" })).toHaveAttribute("href", "/markets");
    expect(screen.getByRole("link", { name: "Tokens" })).toHaveAttribute("href", "/tokens");
    expect(screen.getByRole("link", { name: "Tokens" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("routes shell search into /markets", () => {
    render(<TokensPage />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search markets" }), {
      target: { value: "hush" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(pushMock).toHaveBeenCalledWith("/markets?search=hush");
  });

  it("ForgeOverlay is not visible on load", () => {
    render(<TokensPage />);
    expect(
      screen.queryByRole("dialog", { name: "Forge a Token" })
    ).not.toBeInTheDocument();
  });

  it("Forge Token button is shown when wallet is connected", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    expect(screen.getByText("Forge Token")).toBeInTheDocument();
  });

  it("Forge Token button is not shown when wallet is disconnected", () => {
    render(<TokensPage />);
    expect(screen.queryByText("Forge Token")).not.toBeInTheDocument();
  });

  it("Forge Token button is disabled when factory is not deployed", () => {
    setupMocks({
      address: "NwMe",
      connectionStatus: "connected",
      factoryStatus: "not-deployed",
    });
    render(<TokensPage />);
    expect(screen.getByText("Forge Token")).toBeDisabled();
  });

  it("Forge Token button is disabled while factory is checking", () => {
    setupMocks({
      address: "NwMe",
      connectionStatus: "connected",
      factoryStatus: "checking",
    });
    render(<TokensPage />);
    expect(screen.getByText("Forge Token")).toBeDisabled();
  });

  it("Forge Token button is enabled when factory is deployed", () => {
    setupMocks({
      address: "NwMe",
      connectionStatus: "connected",
      factoryStatus: "deployed",
    });
    render(<TokensPage />);
    expect(screen.getByText("Forge Token")).not.toBeDisabled();
  });

  it("clicking Forge Token shows the ForgeOverlay", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    fireEvent.click(screen.getByText("Forge Token"));
    expect(
      screen.getByRole("dialog", { name: "Forge a Token" })
    ).toBeInTheDocument();
  });

  it("ForgeOverlay Cancel returns to dashboard", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    render(<TokensPage />);
    fireEvent.click(screen.getByText("Forge Token"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(
      screen.queryByRole("dialog", { name: "Forge a Token" })
    ).not.toBeInTheDocument();
  });

  it("submits pending tx to the global provider after signature", () => {
    setupMocks({ address: "NwMe", connectionStatus: "connected" });
    const setPendingTx = vi.fn();
    vi.mocked(usePendingTx).mockReturnValue({
      setPendingTx,
      clearPendingTx: vi.fn(),
    });
    render(<TokensPage />);
    fireEvent.click(screen.getByText("Forge Token"));
    fireEvent.click(screen.getByText("FORGE"));
    expect(setPendingTx).toHaveBeenCalledWith({
      txHash: "0xtxhash",
      message: "Waiting for forge transaction confirmation...",
    });
  });

  it("refreshes wallet balances after factory status becomes deployed", () => {
    const refreshBalances = vi.fn();
    let factoryStatus: FactoryDeployStatus = "initializing";

    vi.mocked(useWallet).mockReturnValue({
      walletType: null,
      address: "NwMe",
      balances: [],
      connectionStatus: "connected",
      errorMessage: null,
      installedWallets: [],
      gasBalance: 0n,
      connect: vi.fn(),
      disconnect: vi.fn(),
      refreshBalances,
    });

    vi.mocked(useFactoryDeployment).mockImplementation(() => ({
      status: factoryStatus,
      factoryHash: factoryStatus === "deployed" ? "0xfactory" : "",
      deployError: null,
      deploy: vi.fn(),
      initialize: vi.fn(),
      recheck: vi.fn(),
    }));

    const { rerender } = render(<TokensPage />);
    expect(refreshBalances).not.toHaveBeenCalled();

    factoryStatus = "deployed";
    rerender(<TokensPage />);

    expect(refreshBalances).toHaveBeenCalledTimes(1);
  });

  it("WalletConnectModal opens from header Connect Wallet click", () => {
    render(<TokensPage />);
    fireEvent.click(screen.getByText("Connect Wallet"));
    expect(
      screen.getByRole("dialog", { name: "Connect Wallet" })
    ).toBeInTheDocument();
  });
});
