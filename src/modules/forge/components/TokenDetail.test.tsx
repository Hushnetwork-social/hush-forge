import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TokenDetail } from "./TokenDetail";
import { useTokenDetail } from "../hooks/useTokenDetail";
import type { TokenDetailResult } from "../hooks/useTokenDetail";
import type { TokenEconomicsView, TokenInfo } from "../types";

vi.mock("../hooks/useTokenDetail", () => ({
  useTokenDetail: vi.fn(),
}));

vi.mock("../neo-dapi-adapter", () => ({
  addNEP17Token: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./TokenAdminPanel", () => ({
  TokenAdminPanel: ({ onTxSubmitted }: { onTxSubmitted: (tx: string, message: string) => void }) => (
    <div>
      <button onClick={() => onTxSubmitted("0xpanel", "panel message")}>Panel Action</button>
      TOKEN_ADMIN_PANEL
    </div>
  ),
}));

vi.mock("../forge-config", () => ({
  NEOTUBE_BASE_URL: "https://testnet.neotube.io",
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
  getRuntimeFactoryHash: () => "0xfactory",
}));

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xabc123",
    symbol: "HUSH",
    name: "HushNetwork Token",
    creator: "NwCreator",
    supply: 10_000_000_00000000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    ...overrides,
  };
}

function makeDetailResult(overrides: Partial<TokenDetailResult> = {}): TokenDetailResult {
  return {
    token: makeToken(),
    economics: null,
    loading: false,
    error: null,
    isOwnToken: false,
    isUpgradeable: false,
    ...overrides,
  };
}

function makeEconomics(
  overrides: Partial<TokenEconomicsView> = {}
): TokenEconomicsView {
  return {
    burnRateBps: 0,
    burnRateDisplay: "0.00%",
    creatorFeeDatoshi: 0n,
    creatorFeeDisplay: "0 GAS",
    platformFeeDatoshi: 0n,
    platformFeeDisplay: "0 GAS",
    networkFeeDisclaimer:
      "Neo network GAS fees are charged separately and may be shown differently by your wallet. They are not part of token taxes.",
    ...overrides,
  };
}

describe("TokenDetail", () => {
  beforeEach(() => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult());
    window.localStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("shows contract hash while loading", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ loading: true, token: null }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText("0xabc123")).toBeInTheDocument();
  });

  it("does not show token symbol while loading", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ loading: true, token: null }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.queryByText("HUSH")).not.toBeInTheDocument();
  });

  it("does not show Update Token button", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ isOwnToken: true, isUpgradeable: true }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Update Token/i })).not.toBeInTheDocument();
  });

  it("renders admin panel for own token", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ isOwnToken: true }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText("TOKEN_ADMIN_PANEL")).toBeInTheDocument();
  });

  it("shows admin update hint overlay for own token", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Admin update options" })).toBeInTheDocument();
  });

  it("closes admin update hint overlay on OK", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: "Admin update options" })).not.toBeInTheDocument();
  });

  it("persists admin update hint dismissal for the same token", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );
    const { rerender } = render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: "Admin update options" })).not.toBeInTheDocument();

    rerender(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.queryByRole("dialog", { name: "Admin update options" })).not.toBeInTheDocument();
  });

  it("closes admin update hint overlay on click anywhere", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByTestId("admin-update-hint-overlay"));
    expect(screen.queryByRole("dialog", { name: "Admin update options" })).not.toBeInTheDocument();
  });

  it("closes admin update hint overlay on Escape", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Admin update options" })).not.toBeInTheDocument();
  });

  it("does not show admin update hint for non-upgradable tokens", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: false })
    );
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(
      screen.queryByRole("dialog", { name: "Admin update options" })
    ).not.toBeInTheDocument();
  });

  it("does not render admin panel for visitor", () => {
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.queryByText("TOKEN_ADMIN_PANEL")).not.toBeInTheDocument();
  });

  it("passes onTxSubmitted through admin panel", () => {
    const onTxSubmitted = vi.fn();
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ isOwnToken: true }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={onTxSubmitted} />);

    fireEvent.click(screen.getByText("Panel Action"));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xpanel", "panel message");
  });

  it("shows burn badge when burnRate > 0", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ token: makeToken({ burnRate: 100 }) }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText("Burn 1.00%")).toBeInTheDocument();
  });

  it("shows a market link for speculative tokens", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ token: makeToken({ mode: "speculative" }) })
    );

    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);

    expect(screen.getByRole("link", { name: "View Market" })).toHaveAttribute(
      "href",
      "/markets/0xabc123"
    );
  });

  it("shows a launch speculation CTA for own community tokens", () => {
    window.localStorage.setItem("forge.adminHintDismissed.0xabc123", "1");
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );

    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Launch" })
    ).toHaveAttribute("href", "/tokens/0xabc123/launch");
  });

  it("routes the speculation launch CTA to the dedicated launch page", () => {
    window.localStorage.setItem("forge.adminHintDismissed.0xabc123", "1");
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );

    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Launch" })
    ).toHaveAttribute("href", "/tokens/0xabc123/launch");
  });

  it("shows lock badge when locked = true", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ token: makeToken({ locked: true }) }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText("Locked (Immutable)")).toBeInTheDocument();
  });

  it("calls addNEP17Token when Add to NeoLine is clicked", async () => {
    const { addNEP17Token } = await import("../neo-dapi-adapter");
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Add to NeoLine/i }));
    await waitFor(() => expect(addNEP17Token).toHaveBeenCalledWith("0xabc123", "HUSH", 8));
  });

  it("copy button copies contract hash to clipboard", async () => {
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Copy contract hash"));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("0xabc123");
  });

  it("shows Not registered via Forge note when creator is null", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ token: makeToken({ creator: null }) }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText(/Not registered via Forge/)).toBeInTheDocument();
  });

  it("NeoTube link has correct href", () => {
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    const link = screen.getByLabelText("View on NeoTube");
    expect(link).toHaveAttribute("href", "https://testnet.neotube.io/contract/0xabc123");
  });

  it("shows error message when error occurs", () => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult({ token: null, error: "Token not found" }));
    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText("Token not found")).toBeInTheDocument();
  });

  it("renders the public token economics panel for non-owner visitors", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({
        isOwnToken: false,
        economics: makeEconomics(),
      })
    );

    render(<TokenDetail contractHash="0xabc123" onTxSubmitted={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Token Economics" })
    ).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getAllByText("0 GAS")).toHaveLength(2);
  });
});
