import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWalletStore, WALLET_INITIAL_STATE } from "./wallet-store";

// Mock forge-config
vi.mock("./forge-config", () => ({
  WALLET_STORAGE_KEY: "forge_wallet_type",
  WALLET_ADDRESS_STORAGE_KEY: "forge_wallet_address",
}));

// Mock the dAPI adapter
vi.mock("./neo-dapi-adapter", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getBalances: vi.fn(),
  getWalletType: vi.fn(),
}));

// Import mocks after vi.mock
import {
  connect as mockConnect,
  disconnect as mockDisconnect,
  getBalances as mockGetBalances,
} from "./neo-dapi-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useWalletStore.setState({ ...WALLET_INITIAL_STATE }, false);
}

// ---------------------------------------------------------------------------
// connect
// ---------------------------------------------------------------------------

describe("WalletStore.connect", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("sets connected state and address on success", async () => {
    vi.mocked(mockConnect).mockResolvedValue("NwTestAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);

    await useWalletStore.getState().connect("NeoLine");

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("connected");
    expect(state.address).toBe("NwTestAddress");
    expect(state.walletType).toBe("NeoLine");
    expect(state.errorMessage).toBeNull();
  });

  it("saves wallet type and address to localStorage on success", async () => {
    vi.mocked(mockConnect).mockResolvedValue("NwTestAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);

    await useWalletStore.getState().connect("NeoLine");

    expect(localStorage.getItem("forge_wallet_type")).toBe("NeoLine");
    expect(localStorage.getItem("forge_wallet_address")).toBe("NwTestAddress");
  });

  it("sets error state on connection failure", async () => {
    vi.mocked(mockConnect).mockRejectedValue(new Error("Wallet not installed"));

    await useWalletStore.getState().connect("NeoLine");

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("error");
    expect(state.errorMessage).toBe("Wallet not installed");
    expect(state.address).toBeNull();
    expect(state.walletType).toBeNull();
  });

  it("transitions through connecting state before settling", async () => {
    let capturedStatus: string | null = null;
    vi.mocked(mockConnect).mockImplementation(async () => {
      capturedStatus = useWalletStore.getState().connectionStatus;
      return "NwTestAddress";
    });
    vi.mocked(mockGetBalances).mockResolvedValue([]);

    await useWalletStore.getState().connect("NeoLine");

    expect(capturedStatus).toBe("connecting");
    expect(useWalletStore.getState().connectionStatus).toBe("connected");
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

describe("WalletStore.disconnect", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("resets all state to initial values", async () => {
    // First connect
    vi.mocked(mockConnect).mockResolvedValue("NwTestAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);
    await useWalletStore.getState().connect("NeoLine");

    // Then disconnect
    useWalletStore.getState().disconnect();

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.address).toBeNull();
    expect(state.walletType).toBeNull();
    expect(state.balances).toEqual([]);
    expect(state.errorMessage).toBeNull();
  });

  it("removes wallet type and address from localStorage on disconnect", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    localStorage.setItem("forge_wallet_address", "NwTestAddress");
    useWalletStore.getState().disconnect();
    expect(localStorage.getItem("forge_wallet_type")).toBeNull();
    expect(localStorage.getItem("forge_wallet_address")).toBeNull();
  });

  it("calls dAPI adapter disconnect", async () => {
    vi.mocked(mockConnect).mockResolvedValue("NwTestAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);
    await useWalletStore.getState().connect("NeoLine");

    useWalletStore.getState().disconnect();

    expect(vi.mocked(mockDisconnect)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// refreshBalances
// ---------------------------------------------------------------------------

describe("WalletStore.refreshBalances", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
  });

  it("updates balances when connected", async () => {
    useWalletStore.setState({
      address: "NwTestAddress",
      connectionStatus: "connected",
    });
    const newBalances = [
      {
        contractHash: "0xgas",
        symbol: "GAS",
        amount: 5_000_000_000n,
        decimals: 8,
        displayAmount: "50.00000000",
      },
    ];
    vi.mocked(mockGetBalances).mockResolvedValue(newBalances);

    await useWalletStore.getState().refreshBalances();

    expect(useWalletStore.getState().balances).toEqual(newBalances);
  });

  it("no-ops when not connected", async () => {
    await useWalletStore.getState().refreshBalances();
    expect(vi.mocked(mockGetBalances)).not.toHaveBeenCalled();
  });

  it("silently keeps existing balances on RPC failure", async () => {
    const existing = [
      {
        contractHash: "0xgas",
        symbol: "GAS",
        amount: 100n,
        decimals: 8,
        displayAmount: "0.00000100",
      },
    ];
    useWalletStore.setState({
      address: "NwTestAddress",
      connectionStatus: "connected",
      balances: existing,
    });
    vi.mocked(mockGetBalances).mockRejectedValue(new Error("Network error"));

    await useWalletStore.getState().refreshBalances();

    // Balances unchanged — no error thrown
    expect(useWalletStore.getState().balances).toEqual(existing);
  });
});

// ---------------------------------------------------------------------------
// tryAutoReconnect
// ---------------------------------------------------------------------------

describe("WalletStore.tryAutoReconnect", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("reconnects when localStorage has saved wallet type", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    vi.mocked(mockConnect).mockResolvedValue("NwTestAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);

    await useWalletStore.getState().tryAutoReconnect();

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("connected");
    expect(state.address).toBe("NwTestAddress");
    expect(state.walletType).toBe("NeoLine");
  });

  it("silently stays disconnected when wallet not available", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    vi.mocked(mockConnect).mockRejectedValue(new Error("Wallet not installed"));

    await useWalletStore.getState().tryAutoReconnect();

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.errorMessage).toBeNull();
  });

  it("clears localStorage on silent failure", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    localStorage.setItem("forge_wallet_address", "NwTestAddress");
    vi.mocked(mockConnect).mockRejectedValue(new Error("Not available"));

    await useWalletStore.getState().tryAutoReconnect();

    expect(localStorage.getItem("forge_wallet_type")).toBeNull();
    expect(localStorage.getItem("forge_wallet_address")).toBeNull();
  });

  it("stays disconnected when wallet returns a different account than saved", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    localStorage.setItem("forge_wallet_address", "NwOriginalAddress");
    vi.mocked(mockConnect).mockResolvedValue("NwDifferentAddress");

    await useWalletStore.getState().tryAutoReconnect();

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("disconnected");
    expect(state.address).toBeNull();
    expect(localStorage.getItem("forge_wallet_type")).toBeNull();
    expect(localStorage.getItem("forge_wallet_address")).toBeNull();
  });

  it("reconnects normally when wallet returns the same account as saved", async () => {
    localStorage.setItem("forge_wallet_type", "NeoLine");
    localStorage.setItem("forge_wallet_address", "NwTestAddress");
    vi.mocked(mockConnect).mockResolvedValue("NwTestAddress");
    vi.mocked(mockGetBalances).mockResolvedValue([]);

    await useWalletStore.getState().tryAutoReconnect();

    const state = useWalletStore.getState();
    expect(state.connectionStatus).toBe("connected");
    expect(state.address).toBe("NwTestAddress");
  });

  it("no-ops when localStorage has no saved type", async () => {
    await useWalletStore.getState().tryAutoReconnect();
    expect(vi.mocked(mockConnect)).not.toHaveBeenCalled();
    expect(useWalletStore.getState().connectionStatus).toBe("disconnected");
  });
});
