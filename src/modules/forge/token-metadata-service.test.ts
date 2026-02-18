import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTokenMetadata } from "./token-metadata-service";

// Mock dependencies
vi.mock("./forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
}));

vi.mock("./neo-rpc-client", () => ({
  invokeFunction: vi.fn(),
}));

import { invokeFunction as mockInvokeFunction } from "./neo-rpc-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encodes a string to base64 (simulates Neo N3 ByteString value). */
function b64(s: string): string {
  return btoa(s);
}

/** Encodes a 20-byte hash (all same byte) to base64 in little-endian. */
function b64Hash(byte: number): string {
  const bytes = new Uint8Array(20).fill(byte);
  return btoa(String.fromCharCode(...bytes));
}

/** Decodes little-endian 20-byte hash to 0x-prefixed hex. */
function expectedHash(byte: number): string {
  const hex = byte.toString(16).padStart(2, "0").repeat(20);
  return `0x${hex}`;
}

type HaltResult = {
  state: "HALT";
  gasconsumed: string;
  script: string;
  stack: { type: string; value: unknown }[];
};

function haltResult(stack: { type: string; value: unknown }[]): HaltResult {
  return { state: "HALT", gasconsumed: "100000", script: "", stack };
}

function factoryArrayResult(
  symbol: string,
  name: string,
  creatorByte: number,
  supply: string,
  decimals: string,
  mode: string,
  tier: string,
  createdAt: string
): HaltResult {
  return haltResult([
    {
      type: "Array",
      value: [
        { type: "ByteString", value: b64(symbol) },
        { type: "ByteString", value: b64(name) },
        { type: "ByteString", value: b64Hash(creatorByte) },
        { type: "Integer", value: supply },
        { type: "Integer", value: decimals },
        { type: "ByteString", value: b64(mode) },
        { type: "Integer", value: tier },
        { type: "Integer", value: createdAt },
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveTokenMetadata", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses factory data when registry has the token", async () => {
    vi.mocked(mockInvokeFunction)
      // GetToken call
      .mockResolvedValueOnce(
        factoryArrayResult("HUSH", "HushToken", 0xab, "10000000", "8", "community", "0", "1234567890")
      )
      // Contract calls: symbol, name, decimals, totalSupply
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("HUSH") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("HushToken Direct") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "10000000" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.symbol).toBe("HUSH");
    expect(result.name).toBe("HushToken"); // factory wins over contract
    expect(result.creator).toBe(expectedHash(0xab));
    expect(result.supply).toBe(10_000_000n);
    expect(result.decimals).toBe(8);
    expect(result.mode).toBe("community");
    expect(result.tier).toBe(0);
    expect(result.createdAt).toBe(1_234_567_890);
  });

  it("falls back to contract when factory does not have the token", async () => {
    vi.mocked(mockInvokeFunction)
      // GetToken returns null/empty stack (not in registry)
      .mockResolvedValueOnce(haltResult([{ type: "Any", value: null }]))
      // Contract calls
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("OTHER") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("Other Token") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "0" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "999" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.symbol).toBe("OTHER");
    expect(result.name).toBe("Other Token");
    expect(result.creator).toBeNull();
    expect(result.mode).toBeNull();
    expect(result.supply).toBe(999n);
  });

  it("returns minimal stub when both factory and contract fail", async () => {
    vi.mocked(mockInvokeFunction).mockRejectedValue(
      new Error("Network error")
    );

    const result = await resolveTokenMetadata("0xabc");

    expect(result.contractHash).toBe("0xabc");
    expect(result.symbol).toBe("");
    expect(result.creator).toBeNull();
    expect(result.mode).toBeNull();
    expect(result.supply).toBe(0n);
    // Must not throw
  });

  it("uses contract data when factory Array has wrong format", async () => {
    // Factory returns Array with too few elements
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(haltResult([{ type: "Array", value: [] }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("SYM") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("Symbol Token") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "4" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000000" }]));

    const result = await resolveTokenMetadata("0xabc");

    // Factory data is null (bad format), falls back to contract
    expect(result.symbol).toBe("SYM");
    expect(result.creator).toBeNull();
  });
});
