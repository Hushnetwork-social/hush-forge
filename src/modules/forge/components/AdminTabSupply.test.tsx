import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminTabSupply } from "./AdminTabSupply";
import type { TokenInfo } from "../types";

const invokeMintTokens = vi.fn();
const invokeSetMaxSupply = vi.fn();
const getAddress = vi.fn();
vi.mock("../neo-dapi-adapter", () => ({
  getAddress: () => getAddress(),
  invokeMintTokens: (...args: unknown[]) => invokeMintTokens(...args),
  invokeSetMaxSupply: (...args: unknown[]) => invokeSetMaxSupply(...args),
  WalletRejectedError: class WalletRejectedError extends Error {},
}));

vi.mock("../neo-rpc-client", () => ({
  addressToHash160: (v: string) => {
    if (v === "NwValid") return "0x123";
    throw new Error("invalid");
  },
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
    maxSupply: "0",
    ...overrides,
  };
}

describe("AdminTabSupply", () => {
  beforeEach(() => {
    invokeMintTokens.mockReset();
    invokeSetMaxSupply.mockReset();
    getAddress.mockReset();
    getAddress.mockReturnValue("NwAdmin");
  });

  it("mint calls invokeMintTokens", async () => {
    invokeMintTokens.mockResolvedValue("0xtx");
    const onTxSubmitted = vi.fn();
    render(<AdminTabSupply token={makeToken()} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText("Recipient address"), { target: { value: "NwValid" } });
    fireEvent.change(screen.getByLabelText("Mint amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Mint Tokens/i }));

    await waitFor(() => expect(invokeMintTokens).toHaveBeenCalledWith("0xfactory", "0xtoken", "NwValid", 5n));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xtx", "Minting tokens...");
  });

  it("max supply validation text appears for invalid value", () => {
    render(<AdminTabSupply token={makeToken({ supply: 1000n })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("New max supply"), { target: { value: "999" } });
    expect(screen.getByText(/Must be greater than current supply/i)).toBeInTheDocument();
  });

  it("set max supply calls invokeSetMaxSupply", async () => {
    invokeSetMaxSupply.mockResolvedValue("0xtx2");
    const onTxSubmitted = vi.fn();
    render(<AdminTabSupply token={makeToken({ supply: 1000n })} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText("New max supply"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: /Set Max Supply/i }));

    await waitFor(() => expect(invokeSetMaxSupply).toHaveBeenCalledWith("0xfactory", "0xtoken", 2000n));
    expect(onTxSubmitted).toHaveBeenCalledWith("0xtx2", "Updating max supply...");
  });

  it("accepts grouped max supply input like 1.000.000", async () => {
    invokeSetMaxSupply.mockResolvedValue("0xtx3");
    render(<AdminTabSupply token={makeToken({ supply: 1000n })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New max supply"), { target: { value: "1.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: /Set Max Supply/i }));

    await waitFor(() => expect(invokeSetMaxSupply).toHaveBeenCalledWith("0xfactory", "0xtoken", 1000000n));
  });

  it("rejects fractional-looking max supply input", () => {
    render(<AdminTabSupply token={makeToken({ supply: 1000n })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New max supply"), { target: { value: "1.5" } });
    expect(screen.getByRole("button", { name: /Set Max Supply/i })).toBeDisabled();
  });

  it("fills recipient with connected administrator wallet", () => {
    render(<AdminTabSupply token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Mint to administrator wallet/i }));
    expect(screen.getByLabelText("Recipient address")).toHaveValue("NwAdmin");
  });

  it("shows helper error when no administrator wallet is connected", () => {
    getAddress.mockReturnValueOnce(null);
    render(<AdminTabSupply token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Mint to administrator wallet/i }));
    expect(screen.getByText("Connect an administrator wallet first.")).toBeInTheDocument();
  });

  it("blocks mint when amount would exceed max supply cap", async () => {
    render(
      <AdminTabSupply
        token={makeToken({ supply: 1_010_000n, maxSupply: "1100000" })}
        factoryHash="0xfactory"
        onTxSubmitted={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Recipient address"), { target: { value: "NwValid" } });
    fireEvent.change(screen.getByLabelText("Mint amount"), { target: { value: "100000" } });
    fireEvent.click(screen.getByRole("button", { name: /Mint Tokens/i }));

    await waitFor(() =>
      expect(screen.getByText(/Mint would exceed max supply cap/i)).toBeInTheDocument()
    );
    expect(invokeMintTokens).not.toHaveBeenCalled();
  });

  it("renders object-shaped wallet errors as readable text", async () => {
    invokeMintTokens.mockRejectedValue({ type: "RPC_ERROR", description: "Mint exceeds max supply" });
    render(<AdminTabSupply token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Recipient address"), { target: { value: "NwValid" } });
    fireEvent.change(screen.getByLabelText("Mint amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Mint Tokens/i }));

    await waitFor(() => expect(screen.getByText("Mint exceeds max supply")).toBeInTheDocument());
  });
});
