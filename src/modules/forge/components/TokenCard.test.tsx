import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenCard } from "./TokenCard";
import type { TokenInfo } from "../types";

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xabc123",
    symbol: "HUSH",
    name: "HushNetwork Token",
    creator: "NwCreatorXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    supply: 10_000_000_00000000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe("TokenCard", () => {
  it("renders symbol and name", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        isUpgradeable={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("HUSH")).toBeInTheDocument();
    expect(screen.getByText("HushNetwork Token")).toBeInTheDocument();
  });

  it("own token shows star badge", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={true}
        isUpgradeable={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Your token")).toBeInTheDocument();
  });

  it("upgradeable own token shows open lock", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={true}
        isUpgradeable={true}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Upgradeable")).toBeInTheDocument();
  });

  it("non-upgradeable own token shows closed lock", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={true}
        isUpgradeable={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Not upgradeable")).toBeInTheDocument();
  });

  it("non-own token shows no star or lock", () => {
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        isUpgradeable={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Your token")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Upgradeable")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Not upgradeable")).not.toBeInTheDocument();
  });

  it("calls onClick with contractHash when clicked", () => {
    const onClick = vi.fn();
    render(
      <TokenCard
        token={makeToken()}
        isOwn={false}
        isUpgradeable={false}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole("article"));
    expect(onClick).toHaveBeenCalledWith("0xabc123");
  });
});
