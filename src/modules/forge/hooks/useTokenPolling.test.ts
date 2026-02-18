import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTokenPolling } from "./useTokenPolling";

// Mock forge-service
vi.mock("../forge-service", () => ({
  pollForConfirmation: vi.fn(),
  TxFaultedError: class TxFaultedError extends Error {
    txHash: string;
    constructor(txHash: string) {
      super(`Transaction faulted: ${txHash}`);
      this.name = "TxFaultedError";
      this.txHash = txHash;
    }
  },
  TxTimeoutError: class TxTimeoutError extends Error {
    txHash: string;
    constructor(txHash: string) {
      super(`Transaction confirmation timeout: ${txHash}`);
      this.name = "TxTimeoutError";
      this.txHash = txHash;
    }
  },
}));

import {
  pollForConfirmation as mockPoll,
  TxFaultedError,
  TxTimeoutError,
} from "../forge-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfirmedEvent(contractHash = "0xcontract123") {
  return {
    contractHash,
    creator: "NwCreator",
    symbol: "HUSH",
    supply: 10_000_000n,
    mode: "community" as const,
    tier: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useTokenPolling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not start polling when txHash is null", () => {
    renderHook(() => useTokenPolling(null));
    expect(vi.mocked(mockPoll)).not.toHaveBeenCalled();
  });

  it("starts polling when txHash is provided", () => {
    vi.mocked(mockPoll).mockReturnValue(new Promise(() => {})); // never resolves
    renderHook(() => useTokenPolling("0xtx123"));
    expect(vi.mocked(mockPoll)).toHaveBeenCalledWith("0xtx123", expect.any(Function));
  });

  it("sets status to 'confirmed' and contractHash on success", async () => {
    vi.mocked(mockPoll).mockResolvedValue(makeConfirmedEvent("0xcontract999"));

    const { result } = renderHook(() => useTokenPolling("0xtx"));

    await waitFor(() => expect(result.current.status).toBe("confirmed"));

    expect(result.current.contractHash).toBe("0xcontract999");
    expect(result.current.error).toBeNull();
  });

  it("sets status to 'timeout' and error message on TxTimeoutError", async () => {
    vi.mocked(mockPoll).mockRejectedValue(new TxTimeoutError("0xtx"));

    const { result } = renderHook(() => useTokenPolling("0xtx"));

    await waitFor(() => expect(result.current.status).toBe("timeout"));

    expect(result.current.error).toContain("not confirmed");
    expect(result.current.contractHash).toBeNull();
  });

  it("sets status to 'faulted' and error message on TxFaultedError", async () => {
    vi.mocked(mockPoll).mockRejectedValue(new TxFaultedError("0xtx"));

    const { result } = renderHook(() => useTokenPolling("0xtx"));

    await waitFor(() => expect(result.current.status).toBe("faulted"));

    expect(result.current.error).toContain("faulted");
    expect(result.current.contractHash).toBeNull();
  });

  it("does not update state after unmount (cancelled flag)", async () => {
    let resolve: (v: ReturnType<typeof makeConfirmedEvent>) => void;
    vi.mocked(mockPoll).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      })
    );

    const { result, unmount } = renderHook(() => useTokenPolling("0xtx"));

    expect(result.current.status).toBe("confirming");
    unmount();

    // Resolve after unmount — should not throw or warn
    await act(async () => {
      resolve!(makeConfirmedEvent());
      await Promise.resolve();
    });
    // No assertion needed — test passes if there are no errors/warnings
  });
});
