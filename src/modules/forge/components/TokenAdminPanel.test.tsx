import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenAdminPanel } from "./TokenAdminPanel";
import type { TokenInfo } from "../types";

vi.mock("./AdminTabIdentity", () => ({
  AdminTabIdentity: () => <div>Identity Content</div>,
}));
vi.mock("./AdminTabSupply", () => ({
  AdminTabSupply: () => <div>Supply Content</div>,
}));
vi.mock("./AdminTabProperties", () => ({
  AdminTabProperties: () => <div>Properties Content</div>,
}));
vi.mock("./AdminTabDangerZone", () => ({
  AdminTabDangerZone: () => <div>Danger Content</div>,
}));

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "Hush",
    creator: "NwCreator",
    supply: 1000n,
    decimals: 0,
    mode: "community",
    tier: 0,
    createdAt: 1,
    ...overrides,
  };
}

describe("TokenAdminPanel", () => {
  it("shows tabs when unlocked", () => {
    render(<TokenAdminPanel token={makeToken({ locked: false })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Properties" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Danger Zone" })).toBeInTheDocument();
  });

  it("shows locked banner when token is locked", () => {
    render(<TokenAdminPanel token={makeToken({ locked: true })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText(/Permanently Immutable/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("hides Supply tab when token is not mintable", () => {
    render(<TokenAdminPanel token={makeToken({ mintable: false })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Supply" })).not.toBeInTheDocument();
  });

  it("switches tabs", () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByText("Properties Content")).toBeInTheDocument();
  });
});