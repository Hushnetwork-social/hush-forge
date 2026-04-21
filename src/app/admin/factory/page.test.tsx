import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FactoryAdminPage from "./page";

vi.mock("@/components/layout/ForgeHeader", () => ({
  ForgeHeader: ({ onConnectClick }: { onConnectClick: () => void }) => (
    <header data-testid="forge-header">
      <button onClick={onConnectClick}>Open Connect</button>
    </header>
  ),
}));

vi.mock("@/modules/forge/components/FactoryAdminDashboard", () => ({
  FactoryAdminDashboard: ({
    ownerDisplay,
    assetsError,
  }: {
    ownerDisplay: string;
    assetsError: string | null;
  }) => (
    <div data-testid="factory-admin-dashboard">
      <span>{ownerDisplay}</span>
      {assetsError && <span>{assetsError}</span>}
    </div>
  ),
}));

vi.mock("@/modules/forge/components/FactoryAdminToast", () => ({
  FactoryAdminSuccessToast: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/modules/forge/components/ForgeToaster", () => ({
  ForgePendingToast: ({ message }: { message: string }) => <div>{message}</div>,
  ForgeErrorToast: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/modules/forge/components/WalletConnectModal", () => ({
  WalletConnectModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Connect Wallet">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useFactoryAdminAccess", () => ({
  useFactoryAdminAccess: vi.fn(),
}));

vi.mock("@/modules/forge/factory-governance-service", () => ({
  fetchClaimableFactoryAssets: vi.fn(),
}));

vi.mock("@/modules/forge/forge-service", () => ({
  pollForConfirmation: vi.fn(),
}));

vi.mock("@/modules/forge/neo-dapi-adapter", () => ({
  invokeClaim: vi.fn(),
  invokeClaimAll: vi.fn(),
  invokeSetAllTokensPlatformFee: vi.fn(),
  invokeSetCreationFee: vi.fn(),
  invokeSetOperationFee: vi.fn(),
  invokeSetPaused: vi.fn(),
  invokeUpgradeTemplate: vi.fn(),
}));

vi.mock("@/modules/forge/neo-rpc-client", () => ({
  hash160ToAddress: vi.fn((value: string) => `address:${value}`),
}));

import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useFactoryAdminAccess } from "@/modules/forge/hooks/useFactoryAdminAccess";
import { fetchClaimableFactoryAssets } from "@/modules/forge/factory-governance-service";

const baseWallet = {
  walletType: "NeoLine" as const,
  address: null as string | null,
  balances: [],
  connectionStatus: "disconnected" as const,
  errorMessage: null,
  installedWallets: [{ type: "NeoLine" as const, name: "NeoLine" }],
  gasBalance: 0n,
  connect: vi.fn(),
  disconnect: vi.fn(),
  refreshBalances: vi.fn(),
};

const baseAccess = {
  factoryHash: "0xfactory",
  status: "idle" as const,
  config: null,
  error: null,
  access: {
    connectedAddress: null,
    connectedHash: null,
    ownerHash: null,
    isOwner: false,
    navVisible: false,
    routeAuthorized: false,
  },
  reload: vi.fn(),
};

describe("FactoryAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWallet).mockReturnValue(baseWallet);
    vi.mocked(useFactoryAdminAccess).mockReturnValue(baseAccess);
    vi.mocked(fetchClaimableFactoryAssets).mockResolvedValue([]);
  });

  it("shows connect-wallet required state when disconnected", () => {
    render(<FactoryAdminPage />);

    expect(screen.getByText("Connect Wallet Required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
  });

  it("opens the connect modal from the connect button", () => {
    render(<FactoryAdminPage />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(screen.getByRole("dialog", { name: "Connect Wallet" })).toBeInTheDocument();
  });

  it("shows loading state while owner access is being checked", () => {
    vi.mocked(useWallet).mockReturnValue({
      ...baseWallet,
      address: "Nowner",
      connectionStatus: "connected",
    });
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      ...baseAccess,
      status: "loading",
      access: {
        ...baseAccess.access,
        connectedAddress: "Nowner",
      },
    });

    render(<FactoryAdminPage />);

    expect(screen.getByText("Checking owner access...")).toBeInTheDocument();
  });

  it("shows config error state with retry", () => {
    const reload = vi.fn();
    vi.mocked(useWallet).mockReturnValue({
      ...baseWallet,
      address: "Nowner",
      connectionStatus: "connected",
    });
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      ...baseAccess,
      status: "error",
      error: "RPC unavailable",
      reload,
      access: {
        ...baseAccess.access,
        connectedAddress: "Nowner",
      },
    });

    render(<FactoryAdminPage />);

    expect(screen.getByText("Unable to load TokenFactory configuration")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalled();
  });

  it("shows unauthorized state for connected non-owner wallets", () => {
    vi.mocked(useWallet).mockReturnValue({
      ...baseWallet,
      address: "Nuser",
      connectionStatus: "connected",
    });
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      ...baseAccess,
      status: "ready",
      config: {
        creationFee: 1n,
        operationFee: 2n,
        paused: false,
        owner: "0xowner",
        templateScriptHash: "0xtemplate",
        templateVersion: 1n,
        templateNefStored: true,
        templateManifestStored: true,
      },
      access: {
        connectedAddress: "Nuser",
        connectedHash: "0xuser",
        ownerHash: "0xowner",
        isOwner: false,
        navVisible: false,
        routeAuthorized: false,
      },
    });

    render(<FactoryAdminPage />);

    expect(screen.getByText("Unauthorized")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This page is restricted to the TokenFactory contract owner. Connect the owner wallet to continue."
      )
    ).toBeInTheDocument();
  });

  it("renders the stacked admin dashboard for the authorized owner", async () => {
    vi.mocked(useWallet).mockReturnValue({
      ...baseWallet,
      address: "Nowner",
      connectionStatus: "connected",
    });
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      ...baseAccess,
      status: "ready",
      config: {
        creationFee: 1n,
        operationFee: 2n,
        paused: false,
        owner: "0xowner",
        templateScriptHash: "0xtemplate",
        templateVersion: 1n,
        templateNefStored: true,
        templateManifestStored: true,
      },
      access: {
        connectedAddress: "Nowner",
        connectedHash: "0xowner",
        ownerHash: "0xowner",
        isOwner: true,
        navVisible: true,
        routeAuthorized: true,
      },
    });

    render(<FactoryAdminPage />);

    expect(await screen.findByTestId("factory-admin-dashboard")).toBeInTheDocument();
    expect(screen.getByText("address:0xowner")).toBeInTheDocument();
  });
});
