import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWallet } from "./useWallet";
import { useWalletStore, WALLET_INITIAL_STATE } from "../wallet-store";

// Mock dependencies
vi.mock("../forge-config", () => ({
  GAS_CONTRACT_HASH: "0xd2a4cff31913016155e38e474a2c06d08be276cf",
  WALLET_STORAGE_KEY: "forge_wallet_type",
}));

vi.mock("../neo-dapi-adapter", () => ({
  detectInstalledWallets: vi.fn().mockReturnValue([]),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getBalances: vi.fn(),
}));

import {
  detectInstalledWallets as mockDetect,
  connect as mockConnect,
  getBalances as mockGetBalances,
} from "../neo-dapi-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useWalletStore.setState({ ...WALLET_INITIAL_STATE }, false);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useWallet", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
    vi.mocked(mockDetect).mockReturnValue([]);
    localStorage.clear();
  });

  it("auto-reconnects when localStorage has a saved wallet type", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    vi.mocked(mockConnect).mockResolvedValue("NwAutoAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);

    await act(async () => {
      renderHook(() => useWallet());
    });

    expect(useWalletStore.getState().connectionStatus).toBe("connected");
    expect(useWalletStore.getState().address).toBe("NwAutoAddress");
  });

  it("stays disconnected when localStorage has no saved wallet type", async () => {
    await act(async () => {
      renderHook(() => useWallet());
    });

    expect(useWalletStore.getState().connectionStatus).toBe("disconnected");
    expect(vi.mocked(mockConnect)).not.toHaveBeenCalled();
  });

  it("detects installed wallets on mount", async () => {
    vi.mocked(mockDetect).mockReturnValue([{ type: "NeoLine", name: "NeoLine" }]);

    const { result } = renderHook(() => useWallet());

    await act(async () => {});

    expect(result.current.installedWallets).toHaveLength(1);
    expect(result.current.installedWallets[0].type).toBe("NeoLine");
  });

  it("extracts GAS balance from balances array", () => {
    useWalletStore.setState({
      balances: [
        {
          contractHash: "0xd2a4cff31913016155e38e474a2c06d08be276cf",
          symbol: "GAS",
          amount: 4_738_000_000n,
          decimals: 8,
          displayAmount: "47.38000000",
        },
      ],
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.gasBalance).toBe(4_738_000_000n);
  });

  it("gasBalance is 0n when GAS is not in balances", () => {
    useWalletStore.setState({ balances: [] });
    const { result } = renderHook(() => useWallet());
    expect(result.current.gasBalance).toBe(0n);
  });

  it("exposes wallet state from the store", () => {
    useWalletStore.setState({
      address: "NwExposeTest",
      walletType: "NeoLine",
      connectionStatus: "connected",
      errorMessage: null,
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.address).toBe("NwExposeTest");
    expect(result.current.walletType).toBe("NeoLine");
    expect(result.current.connectionStatus).toBe("connected");
  });
});
