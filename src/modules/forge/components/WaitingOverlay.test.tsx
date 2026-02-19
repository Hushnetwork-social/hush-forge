import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WaitingOverlay } from "./WaitingOverlay";

vi.mock("../forge-config", () => ({
  NEOTUBE_BASE_URL: "https://testnet.neotube.io",
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
}));

describe("WaitingOverlay", () => {
  it("renders the message", () => {
    render(<WaitingOverlay txHash="0xabc123" message="Forging your token..." />);
    expect(screen.getByText("Forging your token...")).toBeInTheDocument();
  });

  it("shows NeoTube link with correct href", () => {
    render(
      <WaitingOverlay txHash="0xabc1234567890abcdef" message="Forging..." />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://testnet.neotube.io/transaction/0xabc1234567890abcdef"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not close when Escape is pressed", () => {
    // WaitingOverlay has no onClose — it is intentionally non-dismissable
    render(<WaitingOverlay txHash="0xabc" message="Forging..." />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Forging...")).toBeInTheDocument();
  });

  it("shows Do not close this window warning", () => {
    render(<WaitingOverlay txHash="0xabc" message="Forging..." />);
    expect(screen.getByText(/Do not close this window/i)).toBeInTheDocument();
  });

  it("truncates long txHash in link text", () => {
    render(
      <WaitingOverlay txHash="0xabc1234567890abcdef" message="Forging..." />
    );
    // "0xabc1234567890abcdef" is 22 chars > 12 → first 8 + "..." + last 6
    // slice(0,8) = "0xabc123", slice(-6) = "abcdef"
    expect(screen.getByText(/0xabc123\.\.\.abcdef/)).toBeInTheDocument();
  });
});
