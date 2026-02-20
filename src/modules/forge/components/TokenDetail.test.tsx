import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TokenDetail } from "./TokenDetail";
import { useTokenDetail } from "../hooks/useTokenDetail";
import type { TokenDetailResult } from "../hooks/useTokenDetail";
import type { TokenInfo } from "../types";

vi.mock("../hooks/useTokenDetail", () => ({
  useTokenDetail: vi.fn(),
}));

vi.mock("../neo-dapi-adapter", () => ({
  addNEP17Token: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../forge-config", () => ({
  NEOTUBE_BASE_URL: "https://testnet.neotube.io",
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
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

function makeDetailResult(
  overrides: Partial<TokenDetailResult> = {}
): TokenDetailResult {
  return {
    token: makeToken(),
    loading: false,
    error: null,
    isOwnToken: false,
    isUpgradeable: false,
    ...overrides,
  };
}

describe("TokenDetail", () => {
  beforeEach(() => {
    vi.mocked(useTokenDetail).mockReturnValue(makeDetailResult());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("shows contract hash while loading", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ loading: true, token: null })
    );
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.getByText("0xabc123")).toBeInTheDocument();
  });

  it("does not show token symbol while loading", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ loading: true, token: null })
    );
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.queryByText("HUSH")).not.toBeInTheDocument();
  });

  it("shows Update Token button for own + upgradeable token", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true, isUpgradeable: true })
    );
    render(<TokenDetail contractHash="0xabc123" onUpdateClick={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Update Token/i })
    ).toBeInTheDocument();
  });

  it("does not show Update Token button for third-party token", () => {
    render(<TokenDetail contractHash="0xabc123" />);
    expect(
      screen.queryByRole("button", { name: /Update Token/i })
    ).not.toBeInTheDocument();
  });

  it("calls addNEP17Token when Add to NeoLine is clicked", async () => {
    const { addNEP17Token } = await import("../neo-dapi-adapter");
    render(<TokenDetail contractHash="0xabc123" />);
    fireEvent.click(screen.getByRole("button", { name: /Add to NeoLine/i }));
    await waitFor(() =>
      expect(addNEP17Token).toHaveBeenCalledWith("0xabc123", "HUSH", 8)
    );
  });

  it("copy button copies contract hash to clipboard", async () => {
    render(<TokenDetail contractHash="0xabc123" />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Copy contract hash"));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("0xabc123");
  });

  it("copy button shows Copied! confirmation after click", async () => {
    render(<TokenDetail contractHash="0xabc123" />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Copy contract hash"));
    });
    expect(screen.getByText(/Copied!/)).toBeInTheDocument();
  });

  it("shows Not registered via Forge note when creator is null", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ token: makeToken({ creator: null as unknown as string }) })
    );
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.getByText(/Not registered via Forge/)).toBeInTheDocument();
  });

  it("NeoTube link has correct href", () => {
    render(<TokenDetail contractHash="0xabc123" />);
    const link = screen.getByLabelText("View on NeoTube");
    expect(link).toHaveAttribute(
      "href",
      "https://testnet.neotube.io/contract/0xabc123"
    );
  });

  it("own token shows Yours badge", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ isOwnToken: true })
    );
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.getByLabelText("Your token")).toBeInTheDocument();
    expect(screen.getByText("Yours")).toBeInTheDocument();
  });

  it("non-own token shows no Yours badge", () => {
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.queryByLabelText("Your token")).not.toBeInTheDocument();
    expect(screen.queryByText("Yours")).not.toBeInTheDocument();
  });

  it("shows Community mode badge", () => {
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.getByText(/Community/)).toBeInTheDocument();
  });

  it("shows error message when error occurs", () => {
    vi.mocked(useTokenDetail).mockReturnValue(
      makeDetailResult({ token: null, error: "Token not found" })
    );
    render(<TokenDetail contractHash="0xabc123" />);
    expect(screen.getByText("Token not found")).toBeInTheDocument();
  });
});
