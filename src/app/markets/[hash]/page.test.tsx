import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MarketPairPage from "./page";
import type { MarketPairReadModel } from "@/modules/forge/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ hash: "0xtoken1" }),
}));

vi.mock("@/modules/forge/hooks/useMarketPair", () => ({
  useMarketPair: vi.fn(),
}));

vi.mock("@/modules/forge/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/components/layout/ForgeHeader", () => ({
  ForgeHeader: ({ onConnectClick }: { onConnectClick: () => void }) => (
    <header data-testid="forge-header">
      <button onClick={onConnectClick}>Connect Wallet</button>
    </header>
  ),
}));

vi.mock("@/modules/forge/components/WalletConnectModal", () => ({
  WalletConnectModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Connect Wallet">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { useMarketPair } from "@/modules/forge/hooks/useMarketPair";
import { useWallet } from "@/modules/forge/hooks/useWallet";

const TOKEN_FACTOR = 100_000_000n;

const samplePair: MarketPairReadModel = {
  pairHash: "0xtoken1",
  tokenHash: "0xtoken1",
  pairLabel: "HUSHDOG/GAS",
  token: {
    contractHash: "0xtoken1",
    symbol: "HUSHDOG",
    name: "Hush Dog",
    creator: "Ncreator111111111111111111",
    supply: 100_000n * TOKEN_FACTOR,
    decimals: 8,
    mode: "speculative",
    tier: 1,
    createdAt: 1_234_567,
  },
  quoteAsset: "GAS",
  marketType: "BondingCurve",
  curve: {
    tokenHash: "0xtoken1",
    contractStatus: "Active",
    status: "active",
    quoteAsset: "GAS",
    virtualQuote: 150_00000000n,
    realQuote: 40_00000000n,
    currentCurveInventory: 70_000n * TOKEN_FACTOR,
    invariantK: 1n,
    graduationThreshold: 60_00000000n,
    graduationReady: false,
    currentPrice: 123_0000n,
    totalTrades: 42n,
    createdAt: 1_234_567,
    curveInventory: 80_000n * TOKEN_FACTOR,
    retainedInventory: 20_000n * TOKEN_FACTOR,
    totalSupply: 100_000n * TOKEN_FACTOR,
  },
  graduation: {
    tokenHash: "0xtoken1",
    realQuote: 40_00000000n,
    graduationThreshold: 60_00000000n,
    progressBps: 6667,
    graduationReady: false,
  },
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
};

function setupMocks({
  pair = samplePair as MarketPairReadModel | null,
  loading = false,
  error = null as string | null,
} = {}) {
  vi.mocked(useMarketPair).mockReturnValue({
    pair,
    capabilities: samplePair.capabilities,
    loading,
    error,
  });

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
}

describe("MarketPairPage", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("renders canonical pair identity and quote asset", () => {
    render(<MarketPairPage />);

    expect(screen.getByText("HUSHDOG/GAS")).toBeInTheDocument();
    expect(screen.getByText("Quote asset: GAS")).toBeInTheDocument();
    expect(screen.getByText("Canonical market")).toBeInTheDocument();
  });

  it("shows launch disclosure and graduation progress", () => {
    render(<MarketPairPage />);

    expect(screen.getByText("Public market launch data")).toBeInTheDocument();
    expect(screen.getByText("80,000 HUSHDOG")).toBeInTheDocument();
    expect(screen.getByText("20,000 HUSHDOG")).toBeInTheDocument();
    expect(screen.getByText("100,000 HUSHDOG")).toBeInTheDocument();
    expect(screen.getByText("Curve progress")).toBeInTheDocument();
  });

  it("keeps chart and placeholder tabs visible in baseline mode", async () => {
    render(<MarketPairPage />);

    expect(
      await screen.findByText("Available after indexer deployment")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trade History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Holders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Top Traders" })).toBeInTheDocument();
  });

  it("shows Graduation Ready messaging when the milestone is latched", () => {
    setupMocks({
      pair: {
        ...samplePair,
        curve: {
          ...samplePair.curve,
          status: "graduation_ready",
          graduationReady: true,
        },
        graduation: {
          ...samplePair.graduation,
          progressBps: 10_000,
          graduationReady: true,
        },
      },
    });

    render(<MarketPairPage />);

    expect(screen.getAllByText("Graduation Ready").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Threshold reached. Trading stays active on the bonding curve until a later migration exists and is executed on-chain."
      )
    ).toBeInTheDocument();
  });

  it("opens the wallet modal from the pair header", () => {
    render(<MarketPairPage />);

    fireEvent.click(screen.getByText("Connect Wallet"));

    expect(
      screen.getByRole("dialog", { name: "Connect Wallet" })
    ).toBeInTheDocument();
  });
});
