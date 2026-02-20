import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenCard } from "./TokenCard";
import type { TokenInfo } from "../types";

// Mock clipboard API (not available in jsdom)
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xabc123def456789012345678901234567890ab",
    symbol: "HUSH",
    name: "HushNetwork Token",
    creator: "NwCreatorXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    supply: 10_000_000_00000000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    isNative: false,
    ...overrides,
  };
}

describe("TokenCard", () => {
  it("renders symbol and name", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("HUSH")).toBeInTheDocument();
    expect(screen.getByText("HushNetwork Token")).toBeInTheDocument();
  });

  it("own token shows Yours badge", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={true}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Your token")).toBeInTheDocument();
    expect(screen.getByText("Yours")).toBeInTheDocument();
  });

  it("non-own token shows no Yours badge", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Your token")).not.toBeInTheDocument();
    expect(screen.queryByText("Yours")).not.toBeInTheDocument();
  });

  it("calls onClick with contractHash when clicked", () => {
    const onClick = vi.fn();
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole("article"));
    expect(onClick).toHaveBeenCalledWith(
      "0xabc123def456789012345678901234567890ab"
    );
  });

  it("hides name when name equals symbol", () => {
    render(
      <TokenCard
        token={makeToken({ symbol: "GAS", name: "GAS" })}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.queryByText("GAS", { selector: "p" })).not.toBeInTheDocument();
  });

  it("shows name when name differs from symbol", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("HushNetwork Token")).toBeInTheDocument();
  });

  it("shows NEP-17 badge for non-native tokens", () => {
    render(
      <TokenCard
        token={makeToken({ isNative: false })}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("NEP-17")).toBeInTheDocument();
  });

  it("shows Native badge for native tokens", () => {
    render(
      <TokenCard
        token={makeToken({ isNative: true })}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("Native")).toBeInTheDocument();
  });

  it("shows truncated contract hash", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("0xabc1...90ab")).toBeInTheDocument();
  });

  it("copy button does not trigger card navigation", () => {
    const onClick = vi.fn();
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByLabelText("Copy contract address"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows Community mode badge in address row", () => {
    render(
      <TokenCard
        token={makeToken({ mode: "community" })}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText(/Community/)).toBeInTheDocument();
  });

  it("shows Crowdfund mode badge", () => {
    render(
      <TokenCard
        token={makeToken({ mode: "crowdfund" })}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText(/Crowdfund/)).toBeInTheDocument();
  });

  it("shows Speculative mode badge", () => {
    render(
      <TokenCard
        token={makeToken({ mode: "speculative" })}
        isOwn={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText(/Speculative/)).toBeInTheDocument();
  });
});
