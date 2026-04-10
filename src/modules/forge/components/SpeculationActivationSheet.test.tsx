import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeculationActivationSheet } from "./SpeculationActivationSheet";
import type { TokenInfo } from "../types";

const fetchFactoryConfig = vi.fn();
const getTokenBalance = vi.fn();
const quoteChangeModeCost = vi.fn();
const invokeChangeMode = vi.fn();
const ensureDevnetSpeculationBootstrap = vi.fn();
const useWalletStore = vi.fn();

vi.mock("../forge-config", () => ({
  GAS_CONTRACT_HASH: "0xgas",
  PRIVATE_NET_RPC_URL: "",
}));

vi.mock("../factory-governance-service", () => ({
  fetchFactoryConfig: (...args: unknown[]) => fetchFactoryConfig(...args),
}));

vi.mock("../neo-rpc-client", () => ({
  getTokenBalance: (...args: unknown[]) => getTokenBalance(...args),
}));

vi.mock("../token-admin-cost-service", () => ({
  quoteChangeModeCost: (...args: unknown[]) => quoteChangeModeCost(...args),
}));

vi.mock("../neo-dapi-adapter", () => ({
  ensureDevnetSpeculationBootstrap: (...args: unknown[]) =>
    ensureDevnetSpeculationBootstrap(...args),
  invokeChangeMode: (...args: unknown[]) => invokeChangeMode(...args),
}));

vi.mock("../wallet-store", () => ({
  useWalletStore: (selector: (state: {
    address: string | null;
    balances: Array<{ contractHash: string; amount: bigint }>;
  }) => unknown) =>
    useWalletStore(selector),
}));

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "Hush",
    creator: "NwCreator",
    supply: 1_000n,
    decimals: 0,
    mode: "community",
    tier: 0,
    createdAt: 1,
    ...overrides,
  };
}

describe("SpeculationActivationSheet", () => {
  beforeEach(() => {
    fetchFactoryConfig.mockReset();
    fetchFactoryConfig.mockResolvedValue({ operationFee: 50_000_000n });
    getTokenBalance.mockReset();
    getTokenBalance.mockResolvedValue(600n);
    quoteChangeModeCost.mockReset();
    quoteChangeModeCost.mockResolvedValue({
      operationFeeDatoshi: 50_000_000n,
      estimatedSystemFeeDatoshi: 1_000_000n,
      estimatedNetworkFeeDatoshi: 1_000_000n,
      estimatedChainFeeDatoshi: 2_000_000n,
      estimatedTotalWalletOutflowDatoshi: 52_000_000n,
    });
    invokeChangeMode.mockReset();
    invokeChangeMode.mockResolvedValue("0xtx");
    ensureDevnetSpeculationBootstrap.mockReset();
    ensureDevnetSpeculationBootstrap.mockResolvedValue("0xrouter");
    useWalletStore.mockReset();
    useWalletStore.mockImplementation((selector) =>
      selector({
        address: "Nowner",
        balances: [{ contractHash: "0xgas", amount: 200_000_000n }],
      })
    );
  });

  it("submits speculation activation with launch-summary handoff data", async () => {
    const onTxSubmitted = vi.fn();
    const onClose = vi.fn();

    render(
      <SpeculationActivationSheet
        open
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={onClose}
        onTxSubmitted={onTxSubmitted}
      />
    );

    expect(await screen.findByText("HUSH/GAS")).toBeInTheDocument();
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("600 HUSH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 HUSH").length).toBeGreaterThan(0);
    expect(await screen.findByText("0.52 GAS")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activate Speculation Market" }));

    await waitFor(() =>
      expect(invokeChangeMode).toHaveBeenCalledWith(
        "0xfactory",
        "0xtoken",
        "speculation",
        ["GAS", "600", "starter"]
      )
    );

    expect(onTxSubmitted).toHaveBeenCalledWith(
      "0xtx",
      "Launching HUSH speculation market...",
      {
        targetTokenHash: "0xtoken",
        redirectPath: "/markets/0xtoken",
        marketLaunchSummary: {
          tokenHash: "0xtoken",
          pairLabel: "HUSH/GAS",
          quoteAsset: "GAS",
          launchProfile: "starter",
          tokenSymbol: "HUSH",
          curveInventoryRaw: "600",
          retainedInventoryRaw: "0",
        },
      }
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("validates partial inventory against the owner balance", async () => {
    render(
      <SpeculationActivationSheet
        open
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /Partial amount/i }));
    fireEvent.change(screen.getByLabelText("Curve inventory input"), {
      target: { value: "700" },
    });

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Curve inventory cannot exceed the current owner balance.");
    expect(
      screen.getByRole("button", { name: "Activate Speculation Market" })
    ).toBeDisabled();
  });

  it("shows the partial inventory input only after selecting that option", async () => {
    render(
      <SpeculationActivationSheet
        open
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Curve inventory input")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Partial amount/i }));

    expect(await screen.findByLabelText("Curve inventory input")).toBeInTheDocument();
  });

  it("formats wallet cost review values for readability", async () => {
    quoteChangeModeCost.mockResolvedValueOnce({
      operationFeeDatoshi: 50_000_000n,
      estimatedSystemFeeDatoshi: 106_433_888n,
      estimatedNetworkFeeDatoshi: 0n,
      estimatedChainFeeDatoshi: 106_433_888n,
      estimatedTotalWalletOutflowDatoshi: 156_433_888n,
    });
    useWalletStore.mockImplementation((selector) =>
      selector({
        address: "Nowner",
        balances: [{ contractHash: "0xgas", amount: 999_993_118_629_180n }],
      })
    );

    render(
      <SpeculationActivationSheet
        open
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(await screen.findByText("1.0643 GAS")).toBeInTheDocument();
    expect(screen.getByText("1.5643 GAS")).toBeInTheDocument();
    expect(screen.getByText("9,999,931.1862 GAS")).toBeInTheDocument();
  });

  it("updates the launch preview when a higher profile is selected", async () => {
    render(
      <SpeculationActivationSheet
        open
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Flagship/i }));
    });

    expect(screen.getAllByText("Flagship").length).toBeGreaterThan(0);
    expect(screen.getByText("9,000 GAS")).toBeInTheDocument();
    expect(screen.getByText("30,000 GAS")).toBeInTheDocument();
  });

  it("renders page navigation controls in page layout", async () => {
    render(
      <SpeculationActivationSheet
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
        layout="page"
        backHref="/tokens/0xtoken"
      />
    );

    expect(await screen.findByRole("link", { name: "Back to Token" })).toHaveAttribute(
      "href",
      "/tokens/0xtoken"
    );
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/tokens/0xtoken"
    );
  });

  it("blocks launch controls while the speculation launch transaction is pending", async () => {
    render(
      <SpeculationActivationSheet
        token={makeToken()}
        factoryHash="0xfactory"
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
        layout="page"
        backHref="/tokens/0xtoken"
        pendingMessage="Forge is preparing the public market."
      />
    );

    expect(await screen.findByText("Launching speculation market")).toBeInTheDocument();
    expect(screen.getByText("Forge is preparing the public market.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate Speculation Market" })).toBeDisabled();
    expect(screen.getByText("Back to Token")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to Token" })).not.toBeInTheDocument();
  });
});
