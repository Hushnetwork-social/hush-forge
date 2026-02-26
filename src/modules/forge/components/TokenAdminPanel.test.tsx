import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenAdminPanel } from "./TokenAdminPanel";
import type { TokenInfo } from "../types";

vi.mock("./AdminTabIdentity", () => ({
  AdminTabIdentity: ({ onStageChange }: { onStageChange?: (change: { id: string; type: "metadata"; label: string; payload: Record<string, string> }) => void }) => (
    <div>
      Identity Content
      <button
        onClick={() =>
          onStageChange?.({
            id: "metadata-0xtoken",
            type: "metadata",
            label: "Update image URL",
            payload: { imageUrl: "https://new.png" },
          })
        }
      >
        Stage Mock
      </button>
    </div>
  ),
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

  it("shows staged changes list after staging from tab", () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Identity" }));
    fireEvent.click(screen.getByText("Stage Mock"));
    expect(screen.getByText("STAGED CHANGES (1)")).toBeInTheDocument();
    expect(screen.getByText("Update image URL")).toBeInTheDocument();
  });
});
