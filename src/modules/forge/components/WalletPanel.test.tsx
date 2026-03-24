import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useTokenStore } from "../token-store";
import type { TokenInfo, WalletBalance } from "../types";
import { WalletPanel } from "./WalletPanel";
import { quoteTokenTransfer } from "../transfer-quote-service";

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

vi.mock("../transfer-quote-service", () => ({
  quoteTokenTransfer: vi.fn(),
}));

vi.mock("../neo-dapi-adapter", () => ({
  invokeBurn: vi.fn(),
  invokeTokenTransfer: vi.fn(),
}));

function makeBalance(
  symbol: string,
  amount: bigint,
  decimals = 8
): WalletBalance {
  return {
    contractHash: `0x${symbol.toLowerCase()}`,
    symbol,
    amount,
    decimals,
    displayAmount: (Number(amount) / 10 ** decimals).toFixed(decimals),
  };
}

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xhush",
    symbol: "HUSH",
    name: "Hush",
    creator: "0xcreator",
    supply: 1_000_000_000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    burnRate: 100,
    creatorFeeRate: 1_500_000,
    platformFeeRate: 2_500_000,
    ...overrides,
  };
}

const baseProps = {
  onConnectClick: vi.fn(),
  onDisconnect: vi.fn(),
  onTxSubmitted: vi.fn(),
};

describe("WalletPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(quoteTokenTransfer).mockResolvedValue({
      grossAmountRaw: 1_000_000_000n,
      recipientAmountRaw: 980_000_000n,
      transferBurnAmountRaw: 20_000_000n,
      totalTokenBurnedRaw: 20_000_000n,
      platformFeeDatoshi: 1_000_000n,
      creatorFeeDatoshi: 500_000n,
      totalGasFeeDatoshi: 1_500_000n,
      isMint: false,
      isDirectBurn: false,
    });
    useTokenStore.setState({
      tokens: [],
      ownTokenHashes: new Set(),
      activeTab: "all",
      searchQuery: "",
      loadingStatus: "idle",
      errorMessage: null,
    });
  });

  it("shows connect button when disconnected", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="disconnected"
        address={null}
        balances={[]}
      />
    );
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("calls onConnectClick when Connect Wallet button is clicked", () => {
    const onConnectClick = vi.fn();
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="disconnected"
        address={null}
        balances={[]}
        onConnectClick={onConnectClick}
      />
    );
    screen.getByText("Connect Wallet").click();
    expect(onConnectClick).toHaveBeenCalled();
  });

  it("does not show address chip in the panel (address is in ForgeHeader)", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwXxxxxxxxxxxxxxxxxxxxxxxxxzzzz"
        balances={[]}
      />
    );
    expect(
      screen.queryByRole("button", { name: /NwXx/ })
    ).not.toBeInTheDocument();
  });

  it("shows first token in carousel when connected", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[
          makeBalance("NEO", 100_00000000n),
          makeBalance("GAS", 47_38000000n),
        ]}
      />
    );
    expect(screen.getByText("NEO")).toBeInTheDocument();
    expect(screen.queryByText("GAS")).not.toBeInTheDocument();
  });

  it("navigates to next token with right arrow", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[
          makeBalance("NEO", 100_00000000n),
          makeBalance("GAS", 47_38000000n),
        ]}
      />
    );
    fireEvent.click(screen.getByLabelText("Next token"));
    expect(screen.getByText("GAS")).toBeInTheDocument();
    expect(screen.queryByText("NEO")).not.toBeInTheDocument();
  });

  it("navigates back with left arrow", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[
          makeBalance("NEO", 100_00000000n),
          makeBalance("GAS", 47_38000000n),
        ]}
      />
    );
    fireEvent.click(screen.getByLabelText("Next token"));
    fireEvent.click(screen.getByLabelText("Previous token"));
    expect(screen.getByText("NEO")).toBeInTheDocument();
  });

  it("left arrow is disabled on first token", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("NEO", 100n), makeBalance("GAS", 100n)]}
      />
    );
    expect(screen.getByLabelText("Previous token")).toBeDisabled();
  });

  it("right arrow is disabled on last token", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("NEO", 100n)]}
      />
    );
    expect(screen.getByLabelText("Next token")).toBeDisabled();
  });

  it("dot indicators appear when there are multiple tokens", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("NEO", 100n), makeBalance("GAS", 100n)]}
      />
    );
    expect(screen.getByLabelText("Go to token 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to token 2")).toBeInTheDocument();
  });

  it("formats integer and decimal parts separately", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("GAS", 9_999_989_86121030n, 8)]}
      />
    );
    expect(screen.getByText("9,999,989")).toBeInTheDocument();
    expect(screen.getByText(".86121...")).toBeInTheDocument();
  });

  it("hides decimal part when balance is a whole number", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("NEO", 1000_00000000n, 8)]}
      />
    );
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(
      screen.queryByText((_, element) => element?.textContent?.startsWith(".") ?? false)
    ).not.toBeInTheDocument();
  });

  it("shows USD price placeholder for every token", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("NEO", 100_00000000n)]}
      />
    );
    expect(screen.getByLabelText("Price in USD")).toBeInTheDocument();
    expect(screen.getByText("$ -")).toBeInTheDocument();
  });

  it("shows connecting spinner while connecting", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connecting"
        address={null}
        balances={[]}
      />
    );
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("shows no tokens message when connected with empty balances", () => {
    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[]}
      />
    );
    expect(screen.getByText("No tokens found")).toBeInTheDocument();
  });

  it("shows burn action for a selected factory-created token with balance", () => {
    useTokenStore.setState({
      tokens: [makeToken()],
    });

    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[
          {
            contractHash: "0xhush",
            symbol: "HUSH",
            amount: 1_500_000_000n,
            decimals: 8,
            displayAmount: "15.00000000",
          },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Transfer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Burn" })).toBeInTheDocument();
  });

  it("does not show burn action for native or non-factory tokens", () => {
    useTokenStore.setState({
      tokens: [
        makeToken({
          contractHash: "0xneo",
          symbol: "NEO",
          creator: null,
          isNative: true,
        }),
      ],
    });

    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[makeBalance("NEO", 100_00000000n)]}
      />
    );

    expect(screen.queryByRole("button", { name: "Burn" })).not.toBeInTheDocument();
  });

  it("opens and closes the burn dialog from the wallet strip", () => {
    useTokenStore.setState({
      tokens: [makeToken()],
    });

    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NwAddr"
        balances={[
          {
            contractHash: "0xhush",
            symbol: "HUSH",
            amount: 1_500_000_000n,
            decimals: 8,
            displayAmount: "15.00000000",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Burn" }));
    expect(screen.getByRole("dialog", { name: "Burn HUSH" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Burn HUSH" })
    ).not.toBeInTheDocument();
  });

  it("opens and closes the transfer dialog from the wallet strip", () => {
    useTokenStore.setState({
      tokens: [makeToken()],
    });

    render(
      <WalletPanel
        {...baseProps}
        connectionStatus="connected"
        address="NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c"
        balances={[
          {
            contractHash: "0xhush",
            symbol: "HUSH",
            amount: 1_500_000_000n,
            decimals: 8,
            displayAmount: "15.00000000",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(
      screen.getByRole("dialog", { name: "Transfer HUSH" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Transfer HUSH" })
    ).not.toBeInTheDocument();
  });
});
