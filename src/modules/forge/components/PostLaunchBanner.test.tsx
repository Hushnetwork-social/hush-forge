import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostLaunchBanner } from "./PostLaunchBanner";
import { persistMarketLaunchSummary } from "../market-launch-banner-state";

describe("PostLaunchBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("renders the first-arrival launch summary and copies the pair url", async () => {
    persistMarketLaunchSummary({
      tokenHash: "0xtoken",
      pairLabel: "HUSH/GAS",
      quoteAsset: "GAS",
      tokenSymbol: "HUSH",
      curveInventoryRaw: "800",
      retainedInventoryRaw: "200",
    });

    render(<PostLaunchBanner tokenHash="0xtoken" decimals={0} />);

    expect(screen.getByText("HUSH/GAS created")).toBeInTheDocument();
    expect(
      screen.getByText(/800 HUSH committed to the curve/i)
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share Pair" }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      window.location.href
    );
  });

  it("does not render after dismissal", () => {
    persistMarketLaunchSummary({
      tokenHash: "0xtoken",
      pairLabel: "HUSH/GAS",
      quoteAsset: "GAS",
      tokenSymbol: "HUSH",
      curveInventoryRaw: "800",
      retainedInventoryRaw: "200",
    });

    render(<PostLaunchBanner tokenHash="0xtoken" decimals={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("HUSH/GAS created")).not.toBeInTheDocument();
    render(<PostLaunchBanner tokenHash="0xtoken" decimals={0} />);
    expect(screen.queryByText("HUSH/GAS created")).not.toBeInTheDocument();
  });
});
