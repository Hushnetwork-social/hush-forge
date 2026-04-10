import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketsPageClient } from "./page";
import type { MarketDiscoveryItem } from "@/modules/forge/types";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/markets",
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useMarketPairs", () => ({
  useMarketPairs: vi.fn(),
}));

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useFactoryAdminAccess", () => ({
  useFactoryAdminAccess: vi.fn(() => ({
    factoryHash: "0xfactory",
    status: "idle",
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
  })),
}));

vi.mock("@/modules/forge/hooks/useQuoteAssetUsdReference", () => ({
  useQuoteAssetUsdReference: vi.fn((asset: "GAS" | "NEO") => ({
    reference: {
      asset,
      provider: "CoinGecko",
      priceUsd: asset === "GAS" ? 1.75 : 12,
      fetchedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    },
    loading: false,
    error: null,
  })),
}));

vi.mock("@/modules/forge/components/WalletConnectModal", () => ({
  WalletConnectModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Connect Wallet">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { useMarketPairs } from "@/modules/forge/hooks/useMarketPairs";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { WalletStore } from "@/modules/forge/wallet-store";

const samplePair: MarketDiscoveryItem = {
  pairHash: "0xtoken1",
  tokenHash: "0xtoken1",
  pairLabel: "HUSHDOG/GAS",
  token: {
    contractHash: "0xtoken1",
    symbol: "HUSHDOG",
    name: "Hush Dog",
    creator: "Nabc",
    supply: 1_000_000n,
    decimals: 8,
    mode: "speculative",
    tier: 1,
    createdAt: 1_234_567,
  },
  quoteAsset: "GAS",
  marketType: "BondingCurve",
  status: "active",
  contractStatus: "Active",
  lastPrice: 123_00000000n,
  volume24h: null,
  tradeCount24h: null,
  totalTrades: 42n,
  createdAt: 1_234_567,
  launchCurveInventory: 800_000n,
  launchRetainedInventory: 200_000n,
  totalSupply: 1_000_000n,
  searchableText: "hushdog 0xtoken1",
  curve: null,
};

function setupMocks({
  connected = false,
  pairs = [samplePair] as MarketDiscoveryItem[],
  trendingPairs = [samplePair] as MarketDiscoveryItem[],
  loading = false,
  error = null as string | null,
} = {}) {
  pushMock.mockReset();
  replaceMock.mockReset();

  vi.mocked(useWallet).mockReturnValue({
    walletType: null,
    address: connected ? "Nwallet" : null,
    balances: [],
    connectionStatus: connected ? "connected" : "disconnected",
    errorMessage: null,
    installedWallets: [],
    gasBalance: 0n,
    connect: vi.fn(),
    disconnect: vi.fn(),
    refreshBalances: vi.fn(),
  });

  vi.mocked(useMarketPairs).mockReturnValue({
    pairs,
    trendingPairs,
    capabilities: {
      mode: "baseline",
      marketList: false,
      trendData: false,
      candles: false,
      tradeHistory: false,
      holders: false,
      topTraders: false,
      liveFeed: false,
      contractChangeFeed: true,
    },
    loading,
    error,
  });

  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: WalletStore) => unknown) =>
      selector({
        address: connected ? "Nwallet" : null,
        connectionStatus: connected ? "connected" : "disconnected",
        disconnect: vi.fn(),
      } as WalletStore)
  );
}

describe("MarketsPage", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("renders as a public market landing with Pairs active", () => {
    render(<MarketsPageClient initialSearch="" />);

    expect(screen.getByRole("link", { name: "Pairs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tokens" })).toHaveAttribute("href", "/tokens");
    expect(screen.getByText("Trending now")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Market Cap" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reserve" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "24h Vol" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Created" })).toBeInTheDocument();
    expect(screen.queryByText("Public markets")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wallet-panel")).not.toBeInTheDocument();
  });

  it("opens the wallet modal from the public landing header", () => {
    render(<MarketsPageClient initialSearch="" />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(
      screen.getByRole("dialog", { name: "Connect Wallet" })
    ).toBeInTheDocument();
  });

  it("updates the route search query as the market search changes", () => {
    render(<MarketsPageClient initialSearch="" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search markets" }), {
      target: { value: "moon" },
    });

    expect(replaceMock).toHaveBeenCalledWith("/markets?search=moon");
  });

  it("shows the empty-state CTA to /tokens when there are no pairs", () => {
    setupMocks({ pairs: [], trendingPairs: [] });
    render(<MarketsPageClient initialSearch="" />);

    expect(screen.getByText("No tradable markets yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Tokens" })).toHaveAttribute("href", "/tokens");
  });

  it("opens the canonical pair route when a table row is clicked", () => {
    render(<MarketsPageClient initialSearch="" />);

    fireEvent.click(screen.getByRole("link", { name: "Open HUSHDOG/GAS" }));

    expect(pushMock).toHaveBeenCalledWith("/markets/0xtoken1");
  });
});
