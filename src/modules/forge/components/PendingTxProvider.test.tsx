import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingTxProvider, usePendingTx } from "./PendingTxProvider";

let mockPathname = "/markets/0xtoken1";
const mockPush = vi.fn();
let mockPollingState = {
  status: "pending" as const,
  contractHash: null as string | null,
  error: null as string | null,
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
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

function TriggerLaunchPending() {
  const { setPendingTx } = usePendingTx();

  return (
    <button
      type="button"
      onClick={() =>
        setPendingTx({
          txHash: "0xlaunch",
          message: "Launching market...",
          targetTokenHash: "0xtoken1",
          redirectPath: "/markets/0xtoken1",
          marketLaunchSummary: {
            tokenHash: "0xtoken1",
            pairLabel: "HUSH/GAS",
            quoteAsset: "GAS",
            tokenSymbol: "HUSH",
            curveInventoryRaw: "800",
            retainedInventoryRaw: "200",
          },
        })
      }
    >
      Queue launch tx
    </button>
  );
}

describe("PendingTxProvider", () => {
  beforeEach(() => {
    mockPathname = "/markets/0xtoken1";
    mockPush.mockReset();
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

  it("redirects to the market route and persists the launch summary after confirmation", async () => {
    mockPathname = "/tokens/0xtoken1";
    const view = render(
      <PendingTxProvider>
        <TriggerLaunchPending />
      </PendingTxProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Queue launch tx" }));

    mockPollingState = {
      status: "confirmed",
      contractHash: null,
      error: null,
    };
    view.rerender(
      <PendingTxProvider>
        <TriggerLaunchPending />
      </PendingTxProvider>
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/markets/0xtoken1"));

    expect(
      localStorage.getItem("forge.market.launch.0xtoken1")
    ).toContain("\"pairLabel\":\"HUSH/GAS\"");
  });
});
