import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTokenTransfers } from "./useTokenTransfers";
import type { Nep17TransferResult } from "../neo-rpc-client";

vi.mock("../neo-rpc-client", () => ({
  getNep17Transfers: vi.fn(),
}));

const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";
const WALLET = "NwTestAddress";

function makeRpcResult(overrides: Partial<Nep17TransferResult> = {}): Nep17TransferResult {
  return {
    address: WALLET,
    sent: [],
    received: [],
    ...overrides,
  };
}

describe("useTokenTransfers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns empty list and does not fetch when walletAddress is null", async () => {
    const { getNep17Transfers } = await import("../neo-rpc-client");
    const { result } = renderHook(() =>
      useTokenTransfers(GAS_HASH, null)
    );
    expect(result.current.transfers).toHaveLength(0);
    expect(result.current.loading).toBe(false);
    expect(getNep17Transfers).not.toHaveBeenCalled();
  });

  it("fetches and filters by contractHash, returns sent + received merged", async () => {
    const { getNep17Transfers } = await import("../neo-rpc-client");
    vi.mocked(getNep17Transfers).mockResolvedValue(
      makeRpcResult({
        received: [
          {
            timestamp: 2000,
            asset_hash: GAS_HASH,
            transfer_address: "NwSender",
            amount: "500000000",
            block_index: 10,
            transfer_notify_index: 0,
            tx_hash: "0xtx1",
          },
          {
            // different token — should be filtered out
            timestamp: 1500,
            asset_hash: "0xother",
            transfer_address: "NwSender",
            amount: "100",
            block_index: 9,
            transfer_notify_index: 0,
            tx_hash: "0xtx_other",
          },
        ],
        sent: [
          {
            timestamp: 1000,
            asset_hash: GAS_HASH,
            transfer_address: null,  // fee burn
            amount: "10000000",
            block_index: 5,
            transfer_notify_index: 0,
            tx_hash: "0xtx2",
          },
        ],
      })
    );

    const { result } = renderHook(() =>
      useTokenTransfers(GAS_HASH, WALLET)
    );

    // Wait until data is loaded (not just loading=false, which can be true initially)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.transfers).toHaveLength(2);
    });

    // 1 received + 1 sent (other token filtered); sorted by timestamp desc
    expect(result.current.transfers[0]).toMatchObject({
      txHash: "0xtx1",
      direction: "in",
      amount: 500000000n,
      counterparty: "NwSender",
    });
    expect(result.current.transfers[1]).toMatchObject({
      txHash: "0xtx2",
      direction: "out",
      amount: 10000000n,
      counterparty: null,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.supported).toBe(true);
  });

  it("sets supported=false when node returns Method not found", async () => {
    const { getNep17Transfers } = await import("../neo-rpc-client");
    vi.mocked(getNep17Transfers).mockRejectedValue(
      new Error("Neo RPC error: Method not found")
    );

    const { result } = renderHook(() =>
      useTokenTransfers(GAS_HASH, WALLET)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.supported).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.transfers).toHaveLength(0);
  });

  it("sets error on generic RPC failure", async () => {
    const { getNep17Transfers } = await import("../neo-rpc-client");
    vi.mocked(getNep17Transfers).mockRejectedValue(
      new Error("Neo RPC unreachable: timeout")
    );

    const { result } = renderHook(() =>
      useTokenTransfers(GAS_HASH, WALLET)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toMatch(/timeout/i);
    });

    expect(result.current.supported).toBe(true);
  });

  it("caps results at 5 most recent transfers", async () => {
    const { getNep17Transfers } = await import("../neo-rpc-client");
    const many = Array.from({ length: 8 }, (_, i) => ({
      timestamp: 1000 + i,
      asset_hash: GAS_HASH,
      transfer_address: "NwSender",
      amount: "1",
      block_index: i,
      transfer_notify_index: 0,
      tx_hash: `0xtx${i}`,
    }));

    vi.mocked(getNep17Transfers).mockResolvedValue(
      makeRpcResult({ received: many })
    );

    const { result } = renderHook(() =>
      useTokenTransfers(GAS_HASH, WALLET)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.transfers).toHaveLength(5);
    });

    // Most recent first: timestamp 1007, 1006, ...
    expect(result.current.transfers[0].timestamp).toBe(1007);
  });
});
