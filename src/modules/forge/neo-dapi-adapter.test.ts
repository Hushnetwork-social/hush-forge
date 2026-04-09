import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectInstalledWallets,
  connect,
  disconnect,
  getAddress,
  invokeForge,
  invokeUpdateMetadata,
  invokeMintTokens,
  invokeSetBurnRate,
  invokeSetMaxSupply,
  invokeSetCreatorFee,
  invokeChangeMode,
  invokeLockToken,
  invokeBurn,
  invokeTokenTransfer,
  invokeBondingCurveBuy,
  invokeBondingCurveSell,
  invokeClaimCreatorFee,
  invokeClaimCreatorFees,
  invokeApplyTokenChanges,
  invokeSetCreationFee,
  invokeSetOperationFee,
  invokeSetPaused,
  invokeUpgradeTemplate,
  invokeClaimAll,
  invokeClaim,
  WalletRejectedError,
} from "./neo-dapi-adapter";

// Mock forge-config
vi.mock("./forge-config", () => ({
  GAS_CONTRACT_HASH: "0xd2a4cff31913016155e38e474a2c06d08be276cf",
  PRIVATE_NET_RPC_URL: "",
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

  it("invokeForge uses CalledByEntry signer scope", async () => {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await invokeForge("0xfactory", 10_000_000n, forgeParams);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { signers: { scopes: string }[] };
    expect(call.signers[0].scopes).toBe("CalledByEntry");
  });

  it("sends data array with 7 elements including creatorFeeRate", async () => {
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
    expect(dataArg.value).toHaveLength(7);
    expect((dataArg.value[4] as { value: unknown }).value).toBe("community");
    // index 5 = imageUrl — defaults to "" when not provided
    expect((dataArg.value[5] as { type: string; value: unknown }).type).toBe("String");
    expect((dataArg.value[5] as { value: unknown }).value).toBe("");
    expect((dataArg.value[6] as { type: string; value: unknown }).type).toBe("Integer");
    expect((dataArg.value[6] as { value: unknown }).value).toBe("0");
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

// ---------------------------------------------------------------------------
// Lifecycle invoke functions (FEAT-078)
// ---------------------------------------------------------------------------

describe("lifecycle invoke functions", () => {
  beforeEach(() => {
    disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  afterEach(() => {
    disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  async function connectMock() {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");
    return instance;
  }

  it("invokeUpdateMetadata calls factory with operation updateTokenMetadata", async () => {
    const instance = await connectMock();
    const txid = await invokeUpdateMetadata("0xfactory", "0xtoken", "https://img.png");
    expect(txid).toBe("0xtestTxId");
    expect(instance.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptHash: "0xfactory",
        operation: "updateTokenMetadata",
      })
    );
  });

  it("invokeMintTokens passes amount as Integer string", async () => {
    const instance = await connectMock();
    await invokeMintTokens("0xfactory", "0xtoken", "NwTestAddress", 500n);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { operation: string; args: { type: string; value: string }[] };
    expect(call.operation).toBe("mintTokens");
    expect(call.args[2]).toEqual({ type: "Integer", value: "500" });
  });

  it("invokeSetBurnRate sends basisPoints as Integer", async () => {
    const instance = await connectMock();
    await invokeSetBurnRate("0xfactory", "0xtoken", 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { operation: string; args: { type: string; value: string }[] };
    expect(call.operation).toBe("setTokenBurnRate");
    expect(call.args[1]).toEqual({ type: "Integer", value: "200" });
  });

  it("invokeSetMaxSupply sends newMax as Integer string", async () => {
    const instance = await connectMock();
    await invokeSetMaxSupply("0xfactory", "0xtoken", 1_000_000n);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { operation: string; args: { type: string; value: string }[] };
    expect(call.operation).toBe("setTokenMaxSupply");
    expect(call.args[1]).toEqual({ type: "Integer", value: "1000000" });
  });

  it("invokeSetCreatorFee calls factory with operation setCreatorFee", async () => {
    const instance = await connectMock();
    await invokeSetCreatorFee("0xfactory", "0xtoken", 5_000_000);
    expect(instance.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "setCreatorFee" })
    );
  });

  it("invokeChangeMode serializes speculation params as [String, Integer]", async () => {
    const instance = await connectMock();
    await invokeChangeMode("0xfactory", "0xtoken", "speculation", ["GAS", "600"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { operation: string; args: { type: string; value: unknown }[] };
    expect(call.operation).toBe("changeTokenMode");
    expect(call.args[1]).toEqual({ type: "String", value: "speculation" });
    expect(call.args[2].type).toBe("Array");
    expect(call.args[2].value).toEqual([
      { type: "String", value: "GAS" },
      { type: "Integer", value: "600" },
    ]);
  });

  it("invokeLockToken calls factory with operation lockToken", async () => {
    const instance = await connectMock();
    await invokeLockToken("0xfactory", "0xtoken");
    expect(instance.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "lockToken" })
    );
  });

  it("invokeBurn calls the token contract with burn and Global scope", async () => {
    const instance = await connectMock();
    await invokeBurn("0xtoken", 125n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      scriptHash: string;
      operation: string;
      args: { type: string; value: string }[];
      signers: { scopes: string }[];
    };
    expect(call.scriptHash).toBe("0xtoken");
    expect(call.operation).toBe("burn");
    expect(call.args).toEqual([{ type: "Integer", value: "125" }]);
    expect(call.signers[0].scopes).toBe("Global");
  });

  it("invokeTokenTransfer calls the token contract with transfer and Global scope", async () => {
    const instance = await connectMock();
    await invokeTokenTransfer("0xtoken", "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU", 125n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      scriptHash: string;
      operation: string;
      args: { type: string; value: string | null }[];
      signers: { scopes: string }[];
    };
    expect(call.scriptHash).toBe("0xtoken");
    expect(call.operation).toBe("transfer");
    expect(call.args).toEqual([
      { type: "Hash160", value: "0x66ac3b95bb060000000000000000000000000000" },
      { type: "Hash160", value: "0xb435bf4b8e34b28a73029eb42d0d99a775799eea" },
      { type: "Integer", value: "125" },
      { type: "Any", value: null },
    ]);
    expect(call.signers[0].scopes).toBe("Global");
  });

  it("invokeBondingCurveBuy sends quote asset transfer with token hash and min out payload", async () => {
    const instance = await connectMock();
    await invokeBondingCurveBuy("0xrouter", "0xtoken", "GAS", 125_000_000n, 1_234n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      scriptHash: string;
      operation: string;
      args: { type: string; value: unknown }[];
    };
    expect(call.scriptHash).toBe("0xd2a4cff31913016155e38e474a2c06d08be276cf");
    expect(call.operation).toBe("transfer");
    expect(call.args[1]).toEqual({ type: "Hash160", value: "0xrouter" });
    expect(call.args[2]).toEqual({ type: "Integer", value: "125000000" });
    expect(call.args[3]).toEqual({
      type: "Array",
      value: [
        { type: "Hash160", value: "0xtoken" },
        { type: "Integer", value: "1234" },
      ],
    });
  });

  it("invokeBondingCurveSell sends token transfer with min quote and declared gross token input", async () => {
    const instance = await connectMock();
    await invokeBondingCurveSell("0xrouter", "0xtoken", 90_000n, 456_789n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      scriptHash: string;
      operation: string;
      args: { type: string; value: unknown }[];
    };
    expect(call.scriptHash).toBe("0xtoken");
    expect(call.operation).toBe("transfer");
    expect(call.args[1]).toEqual({ type: "Hash160", value: "0xrouter" });
    expect(call.args[2]).toEqual({ type: "Integer", value: "90000" });
    expect(call.args[3]).toEqual({
      type: "Array",
      value: [
        { type: "Integer", value: "456789" },
        { type: "Integer", value: "90000" },
      ],
    });
  });

  it("invokeClaimCreatorFee calls the token contract with the requested amount", async () => {
    const instance = await connectMock();
    await invokeClaimCreatorFee("0xtoken", 200_000n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      scriptHash: string;
      operation: string;
      args: { type: string; value: string }[];
      signers: { scopes: string }[];
    };
    expect(call.scriptHash).toBe("0xtoken");
    expect(call.operation).toBe("claimCreatorFee");
    expect(call.args).toEqual([{ type: "Integer", value: "200000" }]);
    expect(call.signers[0].scopes).toBe("Global");
  });

  it("invokeClaimCreatorFees calls the token contract claim-all operation", async () => {
    const instance = await connectMock();
    await invokeClaimCreatorFees("0xtoken");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      scriptHash: string;
      operation: string;
      args: unknown[];
    };
    expect(call.scriptHash).toBe("0xtoken");
    expect(call.operation).toBe("claimCreatorFees");
    expect(call.args).toEqual([]);
  });

  it("invokeApplyTokenChanges sends batch payload with sentinel and changed values", async () => {
    const instance = await connectMock();
    await invokeApplyTokenChanges("0xfactory", "0xtoken", {
      imageUrl: "https://scarlet-given-sheep-822.mypinata.cloud/ipfs/bafybeic7fqu2ri7bd4jhxlvfu35pzzoqhbb54etgk56q5dqmbymicdanme",
      burnRate: 220,
      creatorFeeRate: 150000,
      newMode: "speculation",
      modeParams: [],
      newMaxSupply: -1n,
      mintTo: null,
      mintAmount: 0n,
      lockToken: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { operation: string; args: { type: string; value: unknown }[] };
    expect(call.operation).toBe("applyTokenChanges");
    expect(call.args[1]).toEqual({
      type: "String",
      value: "https://scarlet-given-sheep-822.mypinata.cloud/ipfs/bafybeic7fqu2ri7bd4jhxlvfu35pzzoqhbb54etgk56q5dqmbymicdanme",
    });
    expect(call.args[2]).toEqual({ type: "Integer", value: "220" });
    expect(call.args[3]).toEqual({ type: "Integer", value: "150000" });
    expect(call.args[4]).toEqual({ type: "String", value: "speculation" });
    expect(call.args[6]).toEqual({ type: "Integer", value: "-1" });
    expect(call.args[8]).toEqual({ type: "Integer", value: "0" });
    expect(call.args[9]).toEqual({ type: "Boolean", value: false });
  });

  it("all lifecycle functions use Global witness scope", async () => {
    const instance = await connectMock();
    await invokeSetBurnRate("0xfactory", "0xtoken", 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as { signers: { scopes: string }[] };
    expect(call.signers[0].scopes).toBe("Global");
  });
});

describe("factory governance invoke functions", () => {
  beforeEach(() => {
    disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  afterEach(() => {
    disconnect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).NEOLineN3;
  });

  async function connectMock() {
    const instance = makeMockDapi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");
    return instance;
  }

  it("invokeSetCreationFee sends setCreationFee with integer datoshi", async () => {
    const instance = await connectMock();
    await invokeSetCreationFee("0xfactory", 125_000_000n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      operation: string;
      args: { type: string; value: string }[];
      signers: { scopes: string }[];
    };
    expect(call.operation).toBe("setCreationFee");
    expect(call.args).toEqual([{ type: "Integer", value: "125000000" }]);
    expect(call.signers[0].scopes).toBe("Global");
  });

  it("invokeSetOperationFee sends setOperationFee with integer datoshi", async () => {
    const instance = await connectMock();
    await invokeSetOperationFee("0xfactory", 50_000_000n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      operation: string;
      args: { type: string; value: string }[];
    };
    expect(call.operation).toBe("setOperationFee");
    expect(call.args).toEqual([{ type: "Integer", value: "50000000" }]);
  });

  it("invokeSetPaused sends a boolean flag", async () => {
    const instance = await connectMock();
    await invokeSetPaused("0xfactory", true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      operation: string;
      args: { type: string; value: boolean }[];
    };
    expect(call.operation).toBe("setPaused");
    expect(call.args).toEqual([{ type: "Boolean", value: true }]);
  });

  it("invokeUpgradeTemplate sends NEF as ByteArray and manifest as String", async () => {
    const instance = await connectMock();
    await invokeUpgradeTemplate("0xfactory", "bmVmLWJhc2U2NA==", "{\"name\":\"Template\"}");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      operation: string;
      args: { type: string; value: string }[];
    };
    expect(call.operation).toBe("upgradeTemplate");
    expect(call.args).toEqual([
      { type: "ByteArray", value: "bmVmLWJhc2U2NA==" },
      { type: "String", value: "{\"name\":\"Template\"}" },
    ]);
  });

  it("invokeClaimAll sends asset hash only", async () => {
    const instance = await connectMock();
    await invokeClaimAll("0xfactory", "0x1234567890abcdef1234567890abcdef12345678");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      operation: string;
      args: { type: string; value: string }[];
    };
    expect(call.operation).toBe("claimAll");
    expect(call.args).toEqual([
      { type: "Hash160", value: "0x1234567890abcdef1234567890abcdef12345678" },
    ]);
  });

  it("invokeClaim sends asset hash and integer amount", async () => {
    const instance = await connectMock();
    await invokeClaim("0xfactory", "0x1234567890abcdef1234567890abcdef12345678", 42n);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (instance.invoke.mock.calls[0] as any[])[0] as {
      operation: string;
      args: { type: string; value: string }[];
    };
    expect(call.operation).toBe("claim");
    expect(call.args).toEqual([
      { type: "Hash160", value: "0x1234567890abcdef1234567890abcdef12345678" },
      { type: "Integer", value: "42" },
    ]);
  });

  it("governance invokes map wallet rejection to WalletRejectedError", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue({ type: "CANCELED", message: "" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await expect(invokeSetCreationFee("0xfactory", 1n)).rejects.toBeInstanceOf(WalletRejectedError);
  });

  it("invokeBurn maps wallet rejection to WalletRejectedError", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue({ type: "CANCELED", message: "" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await expect(invokeBurn("0xtoken", 1n)).rejects.toBeInstanceOf(WalletRejectedError);
  });

  it("invokeTokenTransfer maps wallet rejection to WalletRejectedError", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue({ type: "CANCELED", message: "" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await expect(
      invokeTokenTransfer("0xtoken", "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU", 1n)
    ).rejects.toBeInstanceOf(WalletRejectedError);
  });

  it("invokeClaimCreatorFee maps wallet rejection to WalletRejectedError", async () => {
    const instance = makeMockDapi({
      invoke: vi.fn().mockRejectedValue({ type: "CANCELED", message: "" }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).NEOLineN3 = { Neo: makeMockNeo(instance) };
    await connect("NeoLine");

    await expect(invokeClaimCreatorFee("0xtoken", 1n)).rejects.toBeInstanceOf(
      WalletRejectedError
    );
  });
});

