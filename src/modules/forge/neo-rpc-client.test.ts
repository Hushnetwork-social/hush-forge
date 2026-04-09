import { beforeEach, describe, expect, it, vi } from "vitest";
import { NeoRpcError } from "./types";

const { mockGetActiveRpcUrl } = vi.hoisted(() => ({
  mockGetActiveRpcUrl: vi.fn().mockReturnValue("http://localhost:10332"),
}));

vi.mock("./neo-dapi-adapter", () => ({
  getActiveRpcUrl: mockGetActiveRpcUrl,
}));

vi.mock("./forge-config", async () => {
  const actual = await vi.importActual<typeof import("./forge-config")>("./forge-config");
  return {
    ...actual,
    PRIVATE_NET_RPC_URL: "http://fallback:10332",
  };
});

const {
  calculateNetworkFee,
  getApplicationLog,
  getBlockCount,
  getBondingCurveBuyQuote,
  getBondingCurveGraduationProgress,
  getBondingCurveSellQuote,
  getBondingCurveState,
  getNep17Balances,
  getNep17Transfers,
  getTokenBalance,
  invokeFunction,
  invokeScript,
  mapBuyQuoteTuple,
  mapCurveTuple,
  mapGraduationProgressTuple,
  mapSellQuoteTuple,
} = await import("./neo-rpc-client");

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

function byteString(value: string) {
  return { type: "ByteString", value: btoa(value) };
}

function integer(value: bigint | number | string) {
  return { type: "Integer", value: String(value) };
}

function bool(value: boolean) {
  return { type: "Boolean", value };
}

function tupleResult(values: Array<{ type: string; value: unknown }>) {
  return [{ type: "Array", value: values }];
}

describe("getBlockCount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

  it("returns block count on success", async () => {
    mockFetch({ jsonrpc: "2.0", id: 1, result: 42 });
    await expect(getBlockCount()).resolves.toBe(42);
  });

  it("falls back to NEXT_PUBLIC_NEO_RPC_URL when no wallet RPC is active", async () => {
    mockGetActiveRpcUrl.mockReturnValue("");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: 42 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBlockCount()).resolves.toBe(42);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fallback:10332",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws NeoRpcError on network error", async () => {
    mockFetchNetworkError();
    await expect(getBlockCount()).rejects.toThrow(NeoRpcError);
    await expect(getBlockCount()).rejects.toThrow(/unreachable/i);
  });
});

describe("invokeFunction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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

    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(NeoRpcError);
    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(/FAULT/i);
  });

  it("throws NeoRpcError on RPC-level error", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });

    await expect(invokeFunction("0xfactory", "Unknown", [])).rejects.toThrow(NeoRpcError);
  });

  it("throws NeoRpcError on HTTP error", async () => {
    mockFetch({}, false, 503);

    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(NeoRpcError);
    await expect(invokeFunction("0xfactory", "GetMinFee", [])).rejects.toThrow(/503/);
  });
});

describe("invokeScript", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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

describe("calculateNetworkFee", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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

    await expect(calculateNetworkFee("616263")).resolves.toBe(12345n);

    const [, init] = fetchMock.mock.calls[0];
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.method).toBe("calculatenetworkfee");
    expect(parsed.params[0]).toBe("YWJj");
  });
});

describe("getApplicationLog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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
    expect(result!.executions[0].notifications[0].eventname).toBe("TokenCreated");
  });

  it("returns null for unknown txHash (code -100)", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -100, message: "Unknown transaction" },
    });

    await expect(getApplicationLog("0xunknown")).resolves.toBeNull();
  });

  it("returns null for Unknown transaction message", async () => {
    mockFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "Unknown transaction 0xabc" },
    });

    await expect(getApplicationLog("0xabc")).resolves.toBeNull();
  });
});

describe("getTokenBalance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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

    await expect(getTokenBalance("0xtoken", "NwAddress")).resolves.toBe(500000000n);
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

    await expect(getTokenBalance("0xtoken", "NwAddress")).resolves.toBe(0n);
  });

  it("returns 0n on FAULT", async () => {
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

    await expect(getTokenBalance("0xtoken", "NwAddress")).resolves.toBe(0n);
  });
});

describe("getNep17Transfers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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

  it("throws NeoRpcError when the plugin is not installed", async () => {
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

describe("getNep17Balances", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

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

describe("bonding curve tuple mappers", () => {
  it("maps GetCurve tuples into a typed market curve object", () => {
    const curve = mapCurveTuple(
      "0xtoken",
      tupleResult([
        byteString("Active"),
        byteString("GAS"),
        integer("100000000"),
        integer("25000000"),
        integer("750000"),
        integer("987654321"),
        integer("50000000"),
        bool(false),
        integer("123456"),
        integer("42"),
        integer("1710000000"),
        integer("900000"),
        integer("100000"),
        integer("1000000"),
      ])
    );

    expect(curve.quoteAsset).toBe("GAS");
    expect(curve.status).toBe("active");
    expect(curve.currentCurveInventory).toBe(750000n);
    expect(curve.curveInventory).toBe(900000n);
    expect(curve.retainedInventory).toBe(100000n);
    expect(curve.totalSupply).toBe(1000000n);
  });

  it("maps GetBuyQuote tuples including refund and capped flag", () => {
    const quote = mapBuyQuoteTuple(
      "0xtoken",
      tupleResult([
        integer("100000000"),
        integer("80000000"),
        integer("20000000"),
        integer("500000"),
        integer("5000"),
        integer("495000"),
        integer("1000"),
        integer("2000"),
        integer("456789"),
        bool(true),
      ])
    );

    expect(quote.quoteRefund).toBe(20000000n);
    expect(quote.netTokenOut).toBe(495000n);
    expect(quote.capped).toBe(true);
  });

  it("maps GetSellQuote tuples including liquidity guard", () => {
    const quote = mapSellQuoteTuple(
      "0xtoken",
      tupleResult([
        integer("500000"),
        integer("5000"),
        integer("495000"),
        integer("12000000"),
        integer("11990000"),
        integer("500"),
        integer("500"),
        integer("111111"),
        bool(true),
      ])
    );

    expect(quote.netTokenIn).toBe(495000n);
    expect(quote.netQuoteOut).toBe(11990000n);
    expect(quote.liquidityOkay).toBe(true);
  });

  it("maps GetGraduationProgress tuples into a typed progress object", () => {
    const progress = mapGraduationProgressTuple(
      "0xtoken",
      tupleResult([
        integer("45000000"),
        integer("50000000"),
        integer("9000"),
        bool(true),
      ])
    );

    expect(progress.progressBps).toBe(9000);
    expect(progress.graduationReady).toBe(true);
  });

  it("throws NeoRpcError on malformed tuples", () => {
    expect(() => mapCurveTuple("0xtoken", tupleResult([byteString("Active")]))).toThrow(
      NeoRpcError
    );
  });
});

describe("bonding curve RPC helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetActiveRpcUrl.mockReturnValue("http://localhost:10332");
  });

  it("calls getCurve with the token hash and maps the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          state: "HALT",
          gasconsumed: "100000",
          script: "abc",
          stack: tupleResult([
            byteString("Active"),
            byteString("GAS"),
            integer("100000000"),
            integer("25000000"),
            integer("750000"),
            integer("987654321"),
            integer("50000000"),
            bool(false),
            integer("123456"),
            integer("42"),
            integer("1710000000"),
            integer("900000"),
            integer("100000"),
            integer("1000000"),
          ]),
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getBondingCurveState("0xrouter", "0xtoken");

    expect(result.quoteAsset).toBe("GAS");
    const [, init] = fetchMock.mock.calls[0];
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.params[0]).toBe("0xrouter");
    expect(parsed.params[1]).toBe("getCurve");
    expect(parsed.params[2]).toEqual([{ type: "Hash160", value: "0xtoken" }]);
  });

  it("falls back to GetCurve when the router only exposes the legacy alias", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            state: "FAULT",
            gasconsumed: "1",
            script: "abc",
            exception: "Method \"getCurve\" with 1 parameter(s) doesn't exist in the contract.",
            stack: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            state: "HALT",
            gasconsumed: "100000",
            script: "abc",
            stack: tupleResult([
              byteString("Active"),
              byteString("GAS"),
              integer("100000000"),
              integer("25000000"),
              integer("750000"),
              integer("987654321"),
              integer("50000000"),
              bool(false),
              integer("123456"),
              integer("42"),
              integer("1710000000"),
              integer("900000"),
              integer("100000"),
              integer("1000000"),
            ]),
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBondingCurveState("0xrouter", "0xtoken")).resolves.toMatchObject({
      quoteAsset: "GAS",
      totalTrades: 42n,
    });

    const firstCall = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondCall = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstCall.params[1]).toBe("getCurve");
    expect(secondCall.params[1]).toBe("GetCurve");
  });

  it("maps buy, sell, and graduation progress responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            state: "HALT",
            gasconsumed: "1",
            script: "abc",
            stack: tupleResult([
              integer("100000000"),
              integer("80000000"),
              integer("20000000"),
              integer("500000"),
              integer("5000"),
              integer("495000"),
              integer("1000"),
              integer("2000"),
              integer("456789"),
              bool(true),
            ]),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            state: "HALT",
            gasconsumed: "1",
            script: "abc",
            stack: tupleResult([
              integer("500000"),
              integer("5000"),
              integer("495000"),
              integer("12000000"),
              integer("11990000"),
              integer("500"),
              integer("500"),
              integer("111111"),
              bool(true),
            ]),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            state: "HALT",
            gasconsumed: "1",
            script: "abc",
            stack: tupleResult([
              integer("45000000"),
              integer("50000000"),
              integer("9000"),
              bool(true),
            ]),
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBondingCurveBuyQuote("0xrouter", "0xtoken", 1n)).resolves.toMatchObject({
      capped: true,
      quoteRefund: 20000000n,
    });
    await expect(getBondingCurveSellQuote("0xrouter", "0xtoken", 1n)).resolves.toMatchObject({
      liquidityOkay: true,
      netQuoteOut: 11990000n,
    });
    await expect(
      getBondingCurveGraduationProgress("0xrouter", "0xtoken")
    ).resolves.toMatchObject({
      progressBps: 9000,
      graduationReady: true,
    });
  });
});
