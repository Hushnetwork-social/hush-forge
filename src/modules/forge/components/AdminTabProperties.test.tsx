import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminTabProperties } from "./AdminTabProperties";
import type { TokenInfo } from "../types";

const invokeSetBurnRate = vi.fn();
const invokeSetCreatorFee = vi.fn();
const invokeChangeMode = vi.fn();
vi.mock("../neo-dapi-adapter", () => ({
  invokeSetBurnRate: (...args: unknown[]) => invokeSetBurnRate(...args),
  invokeSetCreatorFee: (...args: unknown[]) => invokeSetCreatorFee(...args),
  invokeChangeMode: (...args: unknown[]) => invokeChangeMode(...args),
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
    burnRate: 200,
    ...overrides,
  };
}

describe("AdminTabProperties", () => {
  beforeEach(() => {
    invokeSetBurnRate.mockReset();
    invokeSetCreatorFee.mockReset();
    invokeChangeMode.mockReset();
  });

  it("pre-fills burn rate values", () => {
    render(<AdminTabProperties token={makeToken({ burnRate: 200 })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByLabelText("Burn rate input")).toHaveValue("2.00");
    expect(screen.getByLabelText("Burn rate slider")).toHaveValue("200");
  });

  it("slider and input are synchronized", () => {
    render(<AdminTabProperties token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Burn rate slider"), { target: { value: "500" } });
    expect(screen.getByLabelText("Burn rate input")).toHaveValue("5.00");

    fireEvent.change(screen.getByLabelText("Burn rate input"), { target: { value: "3.00" } });
    expect(screen.getByLabelText("Burn rate slider")).toHaveValue("300");
  });

  it("calls invokeSetBurnRate", async () => {
    invokeSetBurnRate.mockResolvedValue("0xtx");
    const onTxSubmitted = vi.fn();
    render(<AdminTabProperties token={makeToken()} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText("Burn rate input"), { target: { value: "3.00" } });
    fireEvent.click(screen.getByRole("button", { name: /Set Burn Rate/i }));

    await waitFor(() => expect(invokeSetBurnRate).toHaveBeenCalledWith("0xfactory", "0xtoken", 300));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xtx", "Setting burn rate...");
  });

  it("creator fee over max shows validation with GAS units", () => {
    render(<AdminTabProperties token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Creator fee input"), { target: { value: "0.1" } });
    expect(screen.getByText("Creator transfer fee must be between 0 and 0.05 GAS.")).toBeInTheDocument();
  });

  it("mode transition calls invokeChangeMode", async () => {
    invokeChangeMode.mockResolvedValue("0xmode");
    const onTxSubmitted = vi.fn();
    render(<AdminTabProperties token={makeToken({ mode: "community" })} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText("Mode selector"), { target: { value: "speculative" } });
    fireEvent.click(screen.getByRole("button", { name: /Change Mode/i }));

    await waitFor(() => expect(invokeChangeMode).toHaveBeenCalledWith("0xfactory", "0xtoken", "speculative", []));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xmode", "Changing token mode...");
  });
});
