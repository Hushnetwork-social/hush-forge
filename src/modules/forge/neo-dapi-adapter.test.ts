import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectInstalledWallets,
  connect,
  disconnect,
  getAddress,
  invokeForge,
  WalletRejectedError,
} from "./neo-dapi-adapter";

// Mock forge-config
vi.mock("./forge-config", () => ({
  WALLET_STORAGE_KEY: "forge_wallet_type",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDapi(overrides: Partial<{
  getAccount: () => Promise<{ address: string }>;
  invoke: () => Promise<{ txid: string }>;
  getBalance: () => Promise<unknown[]>;
}> = {}) {
  return {
    getAccount: vi.fn().mockResolvedValue({ address: "NwTestAddress" }),
    getBalance: vi.fn().mockResolvedValue([
      { address: "NwTestAddress", balances: [] },
    ]),
    invoke: vi.fn().mockResolvedValue({ txid: "0xtestTxId" }),
    AddNEP17: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Creates a regular function that acts as a Neo dAPI constructor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockNeo(instance: ReturnType<typeof makeMockDapi>): new () => any {
  // Use a regular function so `new MockNeo()` works.
  // When a constructor explicitly returns an object, JS uses that object.
  function MockNeo(this: unknown) { return instance; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return MockNeo as unknown as new () => any;
}

// ---------------------------------------------------------------------------
// detectInstalledWallets
// ---------------------------------------------------------------------------

describe("detectInstalledWallets", () => {
  afterEach(() => {
    // Clean up window mocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    delete w.NEOLineN3;
    delete w.NEOLine;
    delete w.OneGate;
    delete w.neon;
  });

  it("returns empty array when no wallets installed", () => {
    const wallets = detectInstalledWallets();
    expect(wallets).toEqual([]);
  });

  it("detects NeoLine when window.NEOLineN3 is defined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: class {} };
    const wallets = detectInstalledWallets();
    expect(wallets).toHaveLength(1);
    expect(wallets[0].type).toBe("NeoLine");
    expect(wallets[0].name).toBe("NeoLine");
  });

  it("detects OneGate when window.OneGate is defined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OneGate = {};
    const wallets = detectInstalledWallets();
    expect(wallets.some((w) => w.type === "OneGate")).toBe(true);
  });

  it("detects Neon when window.neon is defined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).neon = {};
    const wallets = detectInstalledWallets();
    expect(wallets.some((w) => w.type === "Neon")).toBe(true);
  });

  it("detects multiple wallets simultaneously", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.NEOLineN3 = { Neo: class {} };
    w.neon = {};
    const wallets = detectInstalledWallets();
    expect(wallets.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// connect / disconnect / getAddress
// ---------------------------------------------------------------------------

describe("connect and disconnect", () => {
  beforeEach(() => {
    disconnect();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  it("connect returns wallet address", async () => {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };

    const address = await connect("NeoLine");
    expect(address).toBe("NwTestAddress");
    expect(getAddress()).toBe("NwTestAddress");
  });

  it("connect saves wallet type to localStorage", async () => {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };

    await connect("NeoLine");
    expect(localStorage.getItem("forge_wallet_type")).toBe("NeoLine");
  });

  it("disconnect clears address and localStorage", async () => {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };

    await connect("NeoLine");
    disconnect();

    expect(getAddress()).toBeNull();
    expect(localStorage.getItem("forge_wallet_type")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// invokeForge
// ---------------------------------------------------------------------------

describe("invokeForge", () => {
  const forgeParams = {
    name: "HUSH Token",
    symbol: "HUSH",
    supply: 21_000_000n,
    decimals: 8,
    mode: "community" as const,
  };

  beforeEach(() => {
    disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  it("returns txid on successful invoke", async () => {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    const txid = await invokeForge("0xfactory", 10_000_000n, forgeParams);
    expect(txid).toBe("0xtestTxId");
  });

  it("sends data array with 5 elements including 'community'", async () => {
    const capturedArgs: unknown[] = [];
    const instance = makeMockDapi({
      invoke: vi.fn().mockImplementation((params: { args: unknown[] }) => {
        capturedArgs.push(...params.args);
        return Promise.resolve({ txid: "0xtest" });
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await invokeForge("0xfactory", 10_000_000n, forgeParams);

    // The 4th arg (index 3) is the data Array
    const dataArg = capturedArgs[3] as { type: string; value: unknown[] };
    expect(dataArg.type).toBe("Array");
    expect(dataArg.value).toHaveLength(5);
    expect((dataArg.value[4] as { value: unknown }).value).toBe("community");
  });

  it("throws WalletRejectedError on CANCELED type", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue({ type: "CANCELED", message: "" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await expect(
      invokeForge("0xfactory", 10_000_000n, forgeParams)
    ).rejects.toBeInstanceOf(WalletRejectedError);
  });

  it("throws WalletRejectedError on user cancel message", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue(new Error("User canceled the request")),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await expect(
      invokeForge("0xfactory", 10_000_000n, forgeParams)
    ).rejects.toBeInstanceOf(WalletRejectedError);
  });

  it("propagates non-rejection errors as-is", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue(new Error("Network error")),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    const err = await invokeForge("0xfactory", 10_000_000n, forgeParams).catch(
      (e) => e
    );
    expect(err).not.toBeInstanceOf(WalletRejectedError);
    expect(err.message).toBe("Network error");
  });
});
