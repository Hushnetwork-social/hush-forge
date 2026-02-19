import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ForgeSuccessToast, ForgeErrorToast } from "./ForgeToaster";

vi.mock("../forge-config", () => ({
  NEOTUBE_BASE_URL: "https://testnet.neotube.io",
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
}));

describe("ForgeSuccessToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders symbol and Token Forged message", () => {
    render(
      <ForgeSuccessToast
        symbol="HUSH"

        onViewToken={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Token Forged/i)).toBeInTheDocument();
    expect(screen.getByText(/HUSH/)).toBeInTheDocument();
  });

  it("calls onDismiss after 8 seconds", () => {
    const onDismiss = vi.fn();
    render(
      <ForgeSuccessToast
        symbol="HUSH"

        onViewToken={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("does not dismiss before 8 seconds", () => {
    const onDismiss = vi.fn();
    render(
      <ForgeSuccessToast
        symbol="HUSH"

        onViewToken={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onViewToken when View Token button is clicked", () => {
    const onViewToken = vi.fn();
    render(
      <ForgeSuccessToast
        symbol="HUSH"

        onViewToken={onViewToken}
        onDismiss={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/View Token/i));
    expect(onViewToken).toHaveBeenCalled();
  });

  it("shows block number when provided", () => {
    render(
      <ForgeSuccessToast
        symbol="HUSH"

        blockNumber={42}
        onViewToken={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Block #42/)).toBeInTheDocument();
  });

  it("dismiss button calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <ForgeSuccessToast
        symbol="HUSH"

        onViewToken={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("ForgeErrorToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders error message", () => {
    render(
      <ForgeErrorToast message="Transaction faulted" onDismiss={vi.fn()} />
    );
    expect(screen.getByText("Transaction faulted")).toBeInTheDocument();
  });

  it("calls onDismiss after 6 seconds", () => {
    const onDismiss = vi.fn();
    render(
      <ForgeErrorToast message="Transaction faulted" onDismiss={onDismiss} />
    );
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("does not dismiss before 6 seconds", () => {
    const onDismiss = vi.fn();
    render(
      <ForgeErrorToast message="Transaction faulted" onDismiss={onDismiss} />
    );
    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("shows NeoTube link when txHash provided", () => {
    render(
      <ForgeErrorToast
        message="Transaction faulted"
        txHash="0xtxhash"
        onDismiss={vi.fn()}
      />
    );
    const link = screen.getByText(/View on NeoTube/i);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("0xtxhash")
    );
  });

  it("no NeoTube link when txHash not provided", () => {
    render(
      <ForgeErrorToast message="Transaction faulted" onDismiss={vi.fn()} />
    );
    expect(screen.queryByText(/View on NeoTube/i)).not.toBeInTheDocument();
  });
});
