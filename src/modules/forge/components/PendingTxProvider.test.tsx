import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingTxProvider, usePendingTx } from "./PendingTxProvider";

let mockPathname = "/markets/0xtoken1";
let mockPollingState = {
  status: "pending" as const,
  contractHash: null as string | null,
  error: null as string | null,
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("../hooks/useTokenPolling", () => ({
  useTokenPolling: vi.fn(() => mockPollingState),
}));

vi.mock("./ForgeToaster", () => ({
  ForgePendingToast: () => <div data-testid="pending-toast" />,
  ForgeErrorToast: () => <div data-testid="error-toast" />,
}));

function TriggerPending() {
  const { setPendingTx } = usePendingTx();

  return (
    <button
      type="button"
      onClick={() =>
        setPendingTx({
          txHash: "0xtx",
          message: "Waiting for market confirmation...",
          targetTokenHash: "0xtoken1",
        })
      }
    >
      Queue pending tx
    </button>
  );
}

describe("PendingTxProvider", () => {
  beforeEach(() => {
    mockPathname = "/markets/0xtoken1";
    mockPollingState = {
      status: "pending",
      contractHash: null,
      error: null,
    };
    localStorage.clear();
  });

  it("reloads matching market routes after confirmation", async () => {
    const originalLocation = window.location;
    const reloadSpy = vi.fn();
    // jsdom marks location.reload as non-configurable, so replace the location object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { ...originalLocation, reload: reloadSpy };
    const view = render(
      <PendingTxProvider>
        <TriggerPending />
      </PendingTxProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Queue pending tx" }));
    expect(screen.getByTestId("pending-toast")).toBeInTheDocument();

    mockPollingState = {
      status: "confirmed",
      contractHash: null,
      error: null,
    };
    view.rerender(
      <PendingTxProvider>
        <TriggerPending />
      </PendingTxProvider>
    );

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = originalLocation;
  });
});
