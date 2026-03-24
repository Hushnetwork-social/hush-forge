import { beforeEach, describe, expect, it, vi } from "vitest";
import { quoteTokenTransfer } from "./transfer-quote-service";

vi.mock("./neo-rpc-client", async () => {
  const actual = await vi.importActual<typeof import("./neo-rpc-client")>(
    "./neo-rpc-client"
  );

  return {
    ...actual,
    invokeFunction: vi.fn(),
  };
});

import { invokeFunction } from "./neo-rpc-client";

function haltResult(stack: unknown[]) {
  return {
    script: "00",
    state: "HALT" as const,
    gasconsumed: "12345",
    stack,
  };
}

describe("quoteTokenTransfer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parses the quoteTransfer breakdown into typed bigint fields", async () => {
    vi.mocked(invokeFunction).mockResolvedValue(
      haltResult([
        {
          type: "Array",
          value: [
            { type: "Integer", value: "10000" },
            { type: "Integer", value: "9800" },
            { type: "Integer", value: "200" },
            { type: "Integer", value: "200" },
            { type: "Integer", value: "1000000" },
            { type: "Integer", value: "500000" },
            { type: "Integer", value: "1500000" },
            { type: "Integer", value: "0" },
            { type: "Integer", value: "0" },
          ],
        },
      ])
    );

    const result = await quoteTokenTransfer(
      "0xtoken",
      "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c",
      "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU",
      10_000n
    );

    expect(result).toEqual({
      grossAmountRaw: 10_000n,
      recipientAmountRaw: 9_800n,
      transferBurnAmountRaw: 200n,
      totalTokenBurnedRaw: 200n,
      platformFeeDatoshi: 1_000_000n,
      creatorFeeDatoshi: 500_000n,
      totalGasFeeDatoshi: 1_500_000n,
      isMint: false,
      isDirectBurn: false,
    });

    expect(invokeFunction).toHaveBeenCalledWith("0xtoken", "quoteTransfer", [
      {
        type: "Hash160",
        value: "0x88c48eaef7e64b646440da567cd85c9060efbf63",
      },
      {
        type: "Hash160",
        value: "0xb435bf4b8e34b28a73029eb42d0d99a775799eea",
      },
      { type: "Integer", value: "10000" },
    ]);
  });

  it("throws when quoteTransfer does not return an array stack item", async () => {
    vi.mocked(invokeFunction).mockResolvedValue(
      haltResult([{ type: "Integer", value: "1" }])
    );

    await expect(
      quoteTokenTransfer(
        "0xtoken",
        "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c",
        "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU",
        10_000n
      )
    ).rejects.toThrow(/unexpected stack shape/i);
  });
});
