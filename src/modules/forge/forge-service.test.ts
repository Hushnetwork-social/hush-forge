import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkSymbolAvailability,
  fetchCreationFee,
  checkGasBalance,
  pollForConfirmation,
  parseTokenCreatedEvent,
  quoteCreationCost,
  TxFaultedError,
  TxTimeoutError,
} from "./forge-service";
import type { ApplicationLog } from "./types";

// Mock dependencies
vi.mock("./forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
  GAS_CONTRACT_HASH: "0xd2a4cff31913016155e38e474a2c06d08be276cf",
  TX_POLLING_TIMEOUT_MS: 500, // Short timeout for fast tests
  TX_POLLING_INTERVAL_MS: 100,
  getRuntimeFactoryHash: vi.fn().mockReturnValue("0xfactory"),
  saveFactoryHash: vi.fn(),
}));

vi.mock("./neo-rpc-client", () => ({
  addressToHash160: vi.fn((value: string) => value),
  calculateNetworkFee: vi.fn(),
  getAllFactoryTokenHashes: vi.fn(),
  invokeFunction: vi.fn(),
  invokeScript: vi.fn(),
  getBlockCount: vi.fn(),
  getApplicationLog: vi.fn(),
  getRawMemPool: vi.fn(),
  getTokenBalance: vi.fn(),
}));

vi.mock("./neo-dapi-adapter", () => ({
  invokeForge: vi.fn(),
}));

import {
  addressToHash160 as mockAddressToHash160,
  calculateNetworkFee as mockCalculateNetworkFee,
  getAllFactoryTokenHashes as mockGetAllFactoryTokenHashes,
  invokeFunction as mockInvokeFunction,
  invokeScript as mockInvokeScript,
  getBlockCount as mockGetBlockCount,
  getApplicationLog as mockGetApplicationLog,
  getRawMemPool as mockGetRawMemPool,
  getTokenBalance as mockGetTokenBalance,
} from "./neo-rpc-client";
import "./neo-dapi-adapter"; // mock only — no named imports needed
import { getRuntimeFactoryHash as mockGetRuntimeFactoryHash } from "./forge-config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a valid ApplicationLog with one TokenCreated notification. */
function buildTokenCreatedLog(contractHashBase64: string): ApplicationLog {
  return {
    txid: "0xtx",
    executions: [
      {
        trigger: "Application",
        vmstate: "HALT",
        gasconsumed: "1000000",
        stack: [],
        notifications: [
          {
            contract: "0xfactory",
            eventname: "TokenCreated",
            state: {
              type: "Array",
              value: [
                { type: "ByteString", value: contractHashBase64 },
                { type: "ByteString", value: contractHashBase64 }, // creator (reuse for test)
                { type: "ByteString", value: btoa("HUSH") },
                { type: "Integer", value: "21000000" },
                { type: "ByteString", value: btoa("community") },
                { type: "Integer", value: "0" },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** Builds an ApplicationLog with FAULT state. */
function buildFaultLog(): ApplicationLog {
  return {
    txid: "0xtx",
    executions: [
      {
        trigger: "Application",
        vmstate: "FAULT",
        gasconsumed: "100000",
        stack: [],
        notifications: [],
        exception: "An unhandled exception was thrown",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// fetchCreationFee
// ---------------------------------------------------------------------------

describe("fetchCreationFee", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockGetRuntimeFactoryHash).mockReturnValue("0xfactory");
    vi.mocked(mockGetRawMemPool).mockResolvedValue([]);
  });

  it("returns fee in datoshi and displayGas", async () => {
    vi.mocked(mockInvokeFunction).mockResolvedValue({
      state: "HALT",
      gasconsumed: "100000",
      script: "",
      stack: [{ type: "Integer", value: "1500000000" }],
    });

    const fee = await fetchCreationFee();

    expect(fee.datoshi).toBe(1_500_000_000n);
    expect(fee.displayGas).toBe("15");
  });

  it("falls back to 15 GAS when RPC call fails", async () => {
    vi.mocked(mockInvokeFunction).mockRejectedValue(
      new Error("RPC unreachable")
    );

    const fee = await fetchCreationFee();

    expect(fee.datoshi).toBe(1_500_000_000n);
    expect(fee.displayGas).toBe("15");
  });

  it("falls back when stack is empty", async () => {
    vi.mocked(mockInvokeFunction).mockResolvedValue({
      state: "HALT",
      gasconsumed: "100000",
      script: "",
      stack: [],
    });

    const fee = await fetchCreationFee();

    expect(fee.datoshi).toBe(1_500_000_000n);
  });
});

// ---------------------------------------------------------------------------
// quoteCreationCost
// ---------------------------------------------------------------------------

describe("quoteCreationCost", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockGetRuntimeFactoryHash).mockReturnValue(
      "0x2222222222222222222222222222222222222222"
    );
    vi.mocked(mockAddressToHash160).mockReturnValue(
      "0x1111111111111111111111111111111111111111"
    );
    vi.mocked(mockInvokeScript).mockResolvedValue({
      state: "HALT",
      gasconsumed: "1157121145",
      script: "deadbeef",
      stack: [],
    });
    vi.mocked(mockGetBlockCount).mockResolvedValue(1234);
    vi.mocked(mockCalculateNetworkFee).mockResolvedValue(1_275_520n);
  });

  it("returns factory fee, chain fee, and total wallet outflow for the current create payload", async () => {
    const quote = await quoteCreationCost(
      "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c",
      {
        name: "OneToken",
        symbol: "ONE",
        supply: 1_000_000_000_000_00n,
        decimals: 8,
        mode: "community",
        imageUrl: "https://example.com/one.png",
        creatorFeeRate: 5_000_000,
      },
      1_500_000_000n
    );

    expect(mockInvokeScript).toHaveBeenCalledTimes(1);
    expect(mockCalculateNetworkFee).toHaveBeenCalledTimes(1);
    expect(quote.factoryFeeDatoshi).toBe(1_500_000_000n);
    expect(quote.estimatedSystemFeeDatoshi).toBe(1_272_833_259n);
    expect(quote.estimatedNetworkFeeDatoshi).toBe(1_275_520n);
    expect(quote.estimatedChainFeeDatoshi).toBe(1_274_108_779n);
    expect(quote.estimatedTotalWalletOutflowDatoshi).toBe(2_774_108_779n);
  });
});

// ---------------------------------------------------------------------------
// checkGasBalance
// ---------------------------------------------------------------------------

describe("checkGasBalance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockGetRuntimeFactoryHash).mockReturnValue("0xfactory");
    vi.mocked(mockGetRawMemPool).mockResolvedValue([]);
  });

  it("returns sufficient=true when balance exceeds fee + 10% buffer", async () => {
    vi.mocked(mockGetTokenBalance).mockResolvedValue(2_000_000_000n); // 20 GAS

    const result = await checkGasBalance("NwAddress", 1_500_000_000n);

    expect(result.sufficient).toBe(true);
    expect(result.actual).toBe(2_000_000_000n);
    expect(result.required).toBe(1_650_000_000n); // 1.5 GAS + 10%
  });

  it("returns sufficient=false when balance is below fee + buffer", async () => {
    vi.mocked(mockGetTokenBalance).mockResolvedValue(500_000_000n); // 5 GAS

    const result = await checkGasBalance("NwAddress", 1_500_000_000n);

    expect(result.sufficient).toBe(false);
    expect(result.actual).toBe(500_000_000n);
    expect(result.required).toBe(1_650_000_000n);
  });
});

// ---------------------------------------------------------------------------
// checkSymbolAvailability
// ---------------------------------------------------------------------------

describe("checkSymbolAvailability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockGetRuntimeFactoryHash).mockReturnValue("0xfactory");
  });

  it("blocks native symbols NEO/GAS", async () => {
    await expect(checkSymbolAvailability("NEO")).resolves.toEqual({
      available: false,
      reason: "Symbol NEO is reserved by a native Neo token.",
    });
    await expect(checkSymbolAvailability("gas")).resolves.toEqual({
      available: false,
      reason: "Symbol GAS is reserved by a native Neo token.",
    });
  });

  it("blocks symbol already used by a factory token", async () => {
    vi.mocked(mockGetAllFactoryTokenHashes).mockResolvedValue(["0xtoken1"]);
    vi.mocked(mockInvokeFunction).mockResolvedValue({
      state: "HALT",
      gasconsumed: "1",
      script: "",
      stack: [
        {
          type: "Array",
          value: [{ type: "ByteString", value: btoa("HUSH") }],
        },
      ],
    });

    const result = await checkSymbolAvailability("hush");
    expect(result.available).toBe(false);
    expect(result.reason).toContain("Symbol HUSH is already in use by 0xtoken1.");
  });

  it("allows symbol when no match exists", async () => {
    vi.mocked(mockGetAllFactoryTokenHashes).mockResolvedValue(["0xtoken1"]);
    vi.mocked(mockInvokeFunction).mockResolvedValue({
      state: "HALT",
      gasconsumed: "1",
      script: "",
      stack: [
        {
          type: "Array",
          value: [{ type: "ByteString", value: btoa("OTHER") }],
        },
      ],
    });

    await expect(checkSymbolAvailability("HUSH")).resolves.toEqual({
      available: true,
    });
  });
});

// ---------------------------------------------------------------------------
// pollForConfirmation
// ---------------------------------------------------------------------------

describe("pollForConfirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockGetRuntimeFactoryHash).mockReturnValue("0xfactory");
  });
  afterEach(() => vi.useRealTimers());

  it("resolves with contractHash when TokenCreated appears on the third poll", async () => {
    // First two polls return null (pending), third returns the log
    const hashBytes = new Uint8Array(20).fill(1); // 20 bytes of 0x01
    const base64 = btoa(String.fromCharCode(...hashBytes));

    vi.mocked(mockGetApplicationLog)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildTokenCreatedLog(base64));

    vi.useFakeTimers();
    const promise = pollForConfirmation("0xtx");

    // Advance enough time for 3 polls (2 x 100ms intervals + initial)
    await vi.advanceTimersByTimeAsync(300);

    const event = await promise;
    expect(event.contractHash).toMatch(/^0x[0-9a-f]{40}$/);
    expect(vi.mocked(mockGetApplicationLog)).toHaveBeenCalledTimes(3);
  });

  it("resolves confirmed even when HALT log has no TokenCreated event", async () => {
    vi.mocked(mockGetApplicationLog).mockResolvedValue({
      txid: "0xtx",
      executions: [
        {
          trigger: "Application",
          vmstate: "HALT",
          gasconsumed: "100000",
          stack: [],
          notifications: [],
        },
      ],
    });

    vi.useFakeTimers();
    const promise = pollForConfirmation("0xtx");
    await vi.advanceTimersByTimeAsync(50);
    const event = await promise;
    expect(event.contractHash).toBeNull();
  });

  it("throws TxTimeoutError after timeout (500ms with mocked config)", async () => {
    vi.mocked(mockGetApplicationLog).mockResolvedValue(null);

    vi.useFakeTimers();
    const promise = pollForConfirmation("0xtx");
    // Attach handler immediately to prevent unhandled-rejection warning
    const caught = promise.catch((e: unknown) => e);

    // Advance past the mocked 500ms timeout
    await vi.advanceTimersByTimeAsync(700);

    expect(await caught).toBeInstanceOf(TxTimeoutError);
  });

  it("throws TxFaultedError immediately on FAULT state", async () => {
    vi.mocked(mockGetApplicationLog).mockResolvedValue(buildFaultLog());

    vi.useFakeTimers();
    const promise = pollForConfirmation("0xtx");
    const caught = promise.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(50);

    expect(await caught).toBeInstanceOf(TxFaultedError);
    // Should not have retried
    expect(vi.mocked(mockGetApplicationLog)).toHaveBeenCalledTimes(1);
  });

  it("calls onProgress callback with confirming status while pending", async () => {
    const onProgress = vi.fn();
    const hashBytes = new Uint8Array(20).fill(2);
    const base64 = btoa(String.fromCharCode(...hashBytes));

    vi.mocked(mockGetApplicationLog)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildTokenCreatedLog(base64));
    vi.mocked(mockGetRawMemPool).mockResolvedValueOnce(["0xtx"]);

    vi.useFakeTimers();
    const promise = pollForConfirmation("0xtx", onProgress);

    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(onProgress).toHaveBeenCalledWith("confirming");
    expect(onProgress).toHaveBeenCalledWith("confirmed");
  });
});

// ---------------------------------------------------------------------------
// parseTokenCreatedEvent
// ---------------------------------------------------------------------------

describe("parseTokenCreatedEvent", () => {
  it("extracts event fields from ApplicationLog", () => {
    const hashBytes = new Uint8Array(20).fill(0xab);
    const base64 = btoa(String.fromCharCode(...hashBytes));
    const log = buildTokenCreatedLog(base64);

    const event = parseTokenCreatedEvent(log);

    expect(event.symbol).toBe("HUSH");
    expect(event.mode).toBe("community");
    expect(event.supply).toBe(21_000_000n);
    expect(event.tier).toBe(0);
    // contractHash is the decoded hash — verify it's a 0x-prefixed hex string
    expect(event.contractHash).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("throws when no TokenCreated notification found", () => {
    const log: ApplicationLog = {
      txid: "0xtx",
      executions: [
        {
          trigger: "Application",
          vmstate: "HALT",
          gasconsumed: "1000000",
          stack: [],
          notifications: [],
        },
      ],
    };
    expect(() => parseTokenCreatedEvent(log)).toThrow(
      "TokenCreated event not found"
    );
  });
});
