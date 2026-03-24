import { describe, it, expect, vi, beforeEach } from "vitest";
import { NeoRpcError } from "./types";

// Mock the dAPI adapter to provide a stable RPC URL for tests.
// neo-rpc-client calls getActiveRpcUrl() to resolve which node to hit.
vi.mock("./neo-dapi-adapter", () => ({
  getActiveRpcUrl: vi.fn().mockReturnValue("http://localhost:10332"),
}));

// Import after mocking
const {
  invokeFunction,
  invokeScript,
  calculateNetworkFee,
  getApplicationLog,
  getBlockCount,
  getTokenBalance,
  getNep17Transfers,
  getNep17Balances,
} =
  await import("./neo-rpc-client");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    })
  );
}

function mockFetchNetworkError() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
  );
}

// ---------------------------------------------------------------------------
// getBlockCount
// ---------------------------------------------------------------------------

describe("getBlockCount", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns block count on success", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: 42 });
    const count = await getBlockCount();
    expect(count).toBe(42);
  });

  it("throws NeoRpcError on network error", async () => {
    mockFetchNetworkError();
    await expect(getBlockCount()).rejects.toThrow(NeoRpcError);
    await expect(getBlockCount()).rejects.toThrow(/unreachable/i);
  });
});

// ---------------------------------------------------------------------------
// invokeFunction
// ---------------------------------------------------------------------------

describe("invokeFunction", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns InvokeResult on HALT state", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        state: "HALT",
        gasconsumed: "100000",
        script: "abc",
        stack: [{ type: "Integer", value: "1500000000" }],
      },
    });
    const result = await invokeFunction("0xfactory", "GetMinFee", []);
    expect(result.state).toBe("HALT");
    expect(result.stack[0]).toEqual({ type: "Integer", value: "1500000000" });
  });

  it("throws NeoRpcError on FAULT state", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        state: "FAULT",
        gasconsumed: "100000",
        script: "abc",
        stack: [],
        exception: "An unhandled exception was thrown",
      },
    });
    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(
      NeoRpcError
    );
    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(
      /FAULT/i
    );
  });

  it("throws NeoRpcError on RPC-level error", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });
    await expect(invokeFunction("0xfactory", "Unknown", [])).rejects.toThrow(
      NeoRpcError
    );
  });

  it("throws NeoRpcError on HTTP error", async () => {
    mockFetch({}, false, 503);
    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(
      NeoRpcError
    );
    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(
      /503/
    );
  });
});

// ---------------------------------------------------------------------------
// invokeScript
// ---------------------------------------------------------------------------

describe("invokeScript", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("base64-encodes hex scripts before sending them to RPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          state: "HALT",
          gasconsumed: "100000",
          script: "YWJj",
          stack: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await invokeScript("616263", [
      { account: "0x1111111111111111111111111111111111111111", scopes: "CalledByEntry" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.method).toBe("invokescript");
    expect(parsed.params[0]).toBe("YWJj");
  });

  it("throws NeoRpcError when the simulated script faults", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        state: "FAULT",
        gasconsumed: "100000",
        script: "YWJj",
        stack: [],
        exception: "Bad script",
      },
    });

    await expect(invokeScript("616263")).rejects.toThrow(NeoRpcError);
    await expect(invokeScript("616263")).rejects.toThrow(/FAULT/i);
  });
});

// ---------------------------------------------------------------------------
// calculateNetworkFee
// ---------------------------------------------------------------------------

describe("calculateNetworkFee", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("base64-encodes unsigned transactions before sending them to RPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: "12345",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const fee = await calculateNetworkFee("616263");

    expect(fee).toBe(12345n);
    const [, init] = fetchMock.mock.calls[0];
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.method).toBe("calculatenetworkfee");
    expect(parsed.params[0]).toBe("YWJj");
  });
});

// ---------------------------------------------------------------------------
// getApplicationLog
// ---------------------------------------------------------------------------

describe("getApplicationLog", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns ApplicationLog on success", async () => {
    const log = {
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
              state: { type: "Array", value: [] },
            },
          ],
        },
      ],
    };
    mockFetch({ jsonrpc: "2.0", id: 1, result: log });
    const result = await getApplicationLog("0xtx");
    expect(result).not.toBeNull();
    expect(result!.executions[0].notifications[0].eventname).toBe(
      "TokenCreated"
    );
  });

  it("returns null for unknown txHash (code -100)", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -100, message: "Unknown transaction" },
    });
    const result = await getApplicationLog("0xunknown");
    expect(result).toBeNull();
  });

  it("returns null for 'Unknown transaction' message", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "Unknown transaction 0xabc" },
    });
    const result = await getApplicationLog("0xabc");
    expect(result).toBeNull();
  });

  it("throws NeoRpcError on network error", async () => {
    mockFetchNetworkError();
    await expect(getApplicationLog("0xtx")).rejects.toThrow(NeoRpcError);
  });
});

// ---------------------------------------------------------------------------
// getTokenBalance
// ---------------------------------------------------------------------------

describe("getTokenBalance", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns balance as bigint on success", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        state: "HALT",
        gasconsumed: "100000",
        script: "abc",
        stack: [{ type: "Integer", value: "500000000" }],
      },
    });
    const balance = await getTokenBalance("0xtoken", "NwAddress");
    expect(balance).toBe(500000000n);
  });

  it("returns 0n when no stack items", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        state: "HALT",
        gasconsumed: "100000",
        script: "abc",
        stack: [],
      },
    });
    const balance = await getTokenBalance("0xtoken", "NwAddress");
    expect(balance).toBe(0n);
  });

  it("returns 0n on FAULT (address not in contract)", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        state: "FAULT",
        gasconsumed: "100000",
        script: "abc",
        stack: [],
        exception: "no balance",
      },
    });
    const balance = await getTokenBalance("0xtoken", "NwAddress");
    expect(balance).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// getNep17Transfers
// ---------------------------------------------------------------------------

describe("getNep17Transfers", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns sent and received arrays on success", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        address: "NwAddress",
        sent: [
          {
            timestamp: 1000,
            asset_hash: "0xgashash",
            transfer_address: null,
            amount: "10000000",
            block_index: 5,
            transfer_notify_index: 0,
            tx_hash: "0xtx1",
          },
        ],
        received: [],
      },
    });
    const result = await getNep17Transfers("NwAddress");
    expect(result.sent).toHaveLength(1);
    expect(result.sent[0].tx_hash).toBe("0xtx1");
    expect(result.received).toHaveLength(0);
  });

  it("throws NeoRpcError when plugin is not installed (Method not found)", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });
    await expect(getNep17Transfers("NwAddress")).rejects.toThrow(/Method not found/i);
  });

  it("throws NeoRpcError on network error", async () => {
    mockFetchNetworkError();
    await expect(getNep17Transfers("NwAddress")).rejects.toThrow(/unreachable/i);
  });
});

// ---------------------------------------------------------------------------
// getNep17Balances
// ---------------------------------------------------------------------------

describe("getNep17Balances", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns balance entries for any address on success", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      result: {
        address: "Nfactory",
        balance: [
          {
            assethash: "0xgas",
            amount: "250000000",
            lastupdatedblock: 10,
          },
        ],
      },
    });

    const result = await getNep17Balances("Nfactory");
    expect(result.balance).toHaveLength(1);
    expect(result.balance[0].amount).toBe("250000000");
  });

  it("throws NeoRpcError on network error", async () => {
    mockFetchNetworkError();
    await expect(getNep17Balances("Nfactory")).rejects.toThrow(/unreachable/i);
  });
});
