import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminTabIdentity } from "./AdminTabIdentity";
import type { TokenInfo } from "../types";

const invokeUpdateMetadata = vi.fn();
vi.mock("../neo-dapi-adapter", () => ({
  invokeUpdateMetadata: (...args: unknown[]) => invokeUpdateMetadata(...args),
  WalletRejectedError: class WalletRejectedError extends Error {},
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
    imageUrl: "https://x.png",
    ...overrides,
  };
}

describe("AdminTabIdentity", () => {
  beforeEach(() => {
    invokeUpdateMetadata.mockReset();
  });

  it("pre-fills image URL", () => {
    render(<AdminTabIdentity token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByDisplayValue("https://x.png")).toBeInTheDocument();
  });

  it("name and symbol are disabled", () => {
    render(<AdminTabIdentity token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    const hush = screen.getAllByDisplayValue("Hush")[0] as HTMLInputElement;
    const symbol = screen.getByDisplayValue("HUSH") as HTMLInputElement;
    expect(hush.disabled).toBe(true);
    expect(symbol.disabled).toBe(true);
  });

  it("submit button disabled when unchanged", () => {
    render(<AdminTabIdentity token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Update Image URL/i })).toBeDisabled();
  });

  it("calls invokeUpdateMetadata and onTxSubmitted", async () => {
    invokeUpdateMetadata.mockResolvedValue("0xtx");
    const onTxSubmitted = vi.fn();
    render(<AdminTabIdentity token={makeToken()} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://new.png" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Image URL/i }));

    await waitFor(() => expect(invokeUpdateMetadata).toHaveBeenCalledWith("0xfactory", "0xtoken", "https://new.png", undefined));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xtx", "Updating image URL...");
  });
});
