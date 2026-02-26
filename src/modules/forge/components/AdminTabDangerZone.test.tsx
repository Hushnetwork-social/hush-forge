import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminTabDangerZone } from "./AdminTabDangerZone";
import type { TokenInfo } from "../types";

const invokeLockToken = vi.fn();
vi.mock("../neo-dapi-adapter", () => ({
  invokeLockToken: (...args: unknown[]) => invokeLockToken(...args),
  WalletRejectedError: class WalletRejectedError extends Error {},
}));

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "MYTOK",
    name: "My Token",
    creator: "NwCreator",
    supply: 1000n,
    decimals: 0,
    mode: "community",
    tier: 0,
    createdAt: 1,
    ...overrides,
  };
}

describe("AdminTabDangerZone", () => {
  beforeEach(() => {
    invokeLockToken.mockReset();
  });

  it("lock button disabled until exact symbol", () => {
    render(<AdminTabDangerZone token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Lock Token Forever/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the token symbol/i), { target: { value: "mytok" } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the token symbol/i), { target: { value: "MYTOK" } });
    expect(button).toBeEnabled();
  });

  it("calls invokeLockToken on confirm", async () => {
    invokeLockToken.mockResolvedValue("0xlock");
    const onTxSubmitted = vi.fn();
    render(<AdminTabDangerZone token={makeToken()} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText(/type the token symbol/i), { target: { value: "MYTOK" } });
    fireEvent.click(screen.getByRole("button", { name: /Lock Token Forever/i }));

    await waitFor(() => expect(invokeLockToken).toHaveBeenCalledWith("0xfactory", "0xtoken"));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xlock", "Locking token...");
  });
});