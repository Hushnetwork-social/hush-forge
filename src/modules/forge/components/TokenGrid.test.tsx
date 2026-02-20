import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenGrid } from "./TokenGrid";
import { useTokenStore } from "../token-store";
import type { TokenInfo } from "../types";

vi.mock("../forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
}));

vi.mock("../neo-rpc-client", () => ({
  invokeFunction: vi.fn(),
}));

vi.mock("../token-metadata-service", () => ({
  resolveTokenMetadata: vi.fn(),
}));

function makeToken(symbol: string, isOwn = false, mode: TokenInfo["mode"] = "community"): TokenInfo {
  return {
    contractHash: `0x${symbol.toLowerCase()}`,
    symbol,
    name: `${symbol} Token`,
    creator: isOwn ? "NwMe" : "NwOther",
    supply: 1_000_00000000n,
    decimals: 8,
    mode,
    tier: 0,
    createdAt: 1_000_000,
  };
}

function resetStore() {
  useTokenStore.setState(
    {
      tokens: [],
      ownTokenHashes: new Set<string>(),
      activeTab: "new",
      searchQuery: "",
      loadingStatus: "idle",
      errorMessage: null,
    },
    false
  );
}

describe("TokenGrid", () => {
  beforeEach(() => {
    resetStore();
  });

  it("shows loading skeletons while tokens are loading", () => {
    useTokenStore.setState({ loadingStatus: "loading" });
    render(<TokenGrid walletAddress="NwMe" onTokenClick={vi.fn()} />);
    const skeletons = screen.getAllByRole("status");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows connect message when wallet disconnected and no tokens", () => {
    render(<TokenGrid walletAddress={null} onTokenClick={vi.fn()} />);
    expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument();
  });

  it("renders token cards when tokens are loaded", () => {
    const tokens = [makeToken("ALPHA"), makeToken("BETA")];
    useTokenStore.setState({ tokens, loadingStatus: "loaded" });
    render(<TokenGrid walletAddress="NwMe" onTokenClick={vi.fn()} />);
    expect(screen.getByText("ALPHA")).toBeInTheDocument();
    expect(screen.getByText("BETA")).toBeInTheDocument();
  });

  it("Mine tab shows only own tokens", () => {
    const tokens = [makeToken("ALPHA", true), makeToken("BETA", false)];
    useTokenStore.setState({
      tokens,
      ownTokenHashes: new Set(["0xalpha"]),
      loadingStatus: "loaded",
    });
    render(<TokenGrid walletAddress="NwMe" onTokenClick={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "My Tokens" }));
    expect(screen.getByText("ALPHA")).toBeInTheDocument();
    expect(screen.queryByText("BETA")).not.toBeInTheDocument();
  });

  it("own tokens appear before non-own tokens on non-new tabs", () => {
    const tokens = [makeToken("BETA", false), makeToken("ALPHA", true)];
    useTokenStore.setState({
      tokens,
      ownTokenHashes: new Set(["0xalpha"]),
      loadingStatus: "loaded",
      activeTab: "community",
    });
    render(<TokenGrid walletAddress="NwMe" onTokenClick={vi.fn()} />);
    const cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveTextContent("ALPHA");
    expect(cards[1]).toHaveTextContent("BETA");
  });

  it("search input filters visible tokens", () => {
    const tokens = [makeToken("HUSH", true), makeToken("TEST", false)];
    useTokenStore.setState({ tokens, loadingStatus: "loaded" });
    render(<TokenGrid walletAddress="NwMe" onTokenClick={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(input, { target: { value: "HUSH" } });
    expect(screen.getByText("HUSH")).toBeInTheDocument();
    expect(screen.queryByText("TEST")).not.toBeInTheDocument();
  });

  it("renders tab bar with all 5 tabs", () => {
    render(<TokenGrid walletAddress="NwMe" onTokenClick={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "My Tokens" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Community" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Speculative" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Crowdfunding" })).toBeInTheDocument();
  });
});
