import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTokenMetadata } from "./token-metadata-service";

// Mock dependencies
vi.mock("./forge-config", () => ({
  getRuntimeFactoryHash: vi.fn().mockReturnValue("0xfactory"),
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

/**
 * Builds a factory getToken() result matching the actual contract return format:
 *   [symbol, creator, supply, mode, tier, createdAt]
 * Note: name and decimals are NOT stored by the factory.
 */
function factoryArrayResult(
  symbol: string,
  creatorByte: number,
  supply: string,
  mode: string,
  tier: string,
  createdAt: string
): HaltResult {
  return haltResult([
    {
      type: "Array",
      value: [
        { type: "ByteString", value: b64(symbol) },
        { type: "ByteString", value: b64Hash(creatorByte) },
        { type: "Integer", value: supply },
        { type: "ByteString", value: b64(mode) },
        { type: "ByteString", value: b64(tier) },
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
      // getToken call — factory returns [symbol, creator, supply, mode, tier, createdAt]
      .mockResolvedValueOnce(
        factoryArrayResult("HUSH", 0xab, "10000000", "community", "standard", "1234567890")
      )
      // Direct contract calls: symbol, decimals, totalSupply (no name() in TokenTemplate)
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("HUSH") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "10000000" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.symbol).toBe("HUSH");
    // name = symbol (TokenTemplate has no name() method; factory doesn't store it either)
    expect(result.name).toBe("HUSH");
    expect(result.creator).toBe(expectedHash(0xab));
    expect(result.supply).toBe(10_000_000n); // from factory (authoritative)
    expect(result.decimals).toBe(8); // from direct decimals() call
    expect(result.mode).toBe("community");
    expect(result.tier).toBeNull(); // "standard" string → not a number → null
    expect(result.createdAt).toBe(1_234_567_890);
  });

  it("falls back to contract when factory does not have the token", async () => {
    vi.mocked(mockInvokeFunction)
      // getToken returns null/empty stack (not in registry)
      .mockResolvedValueOnce(haltResult([{ type: "Any", value: null }]))
      // Direct contract calls: symbol, decimals, totalSupply
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("OTHER") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "0" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "999" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.symbol).toBe("OTHER");
    // name = symbol (no name() call; use symbol as fallback)
    expect(result.name).toBe("OTHER");
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

  it("returns static metadata for NEO native contract without any RPC calls", async () => {
    const result = await resolveTokenMetadata(
      "0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5"
    );

    expect(result.symbol).toBe("NEO");
    expect(result.name).toBe("NeoToken");
    expect(result.decimals).toBe(0);
    expect(result.supply).toBe(100_000_000n);
    expect(result.creator).toBeNull();
    expect(result.mode).toBeNull();
    expect(result.isNative).toBe(true);
    expect(mockInvokeFunction).not.toHaveBeenCalled();
  });

  it("fetches live totalSupply for GAS native contract", async () => {
    vi.mocked(mockInvokeFunction).mockResolvedValueOnce(
      haltResult([{ type: "Integer", value: "7498207730700000000" }])
    );

    const result = await resolveTokenMetadata(
      "0xd2a4cff31913016155e38e474a2c06d08be276cf"
    );

    expect(result.symbol).toBe("GAS");
    expect(result.name).toBe("GasToken");
    expect(result.decimals).toBe(8);
    expect(result.supply).toBe(7_498_207_730_700_000_000n);
    expect(result.isNative).toBe(true);
    // Only the totalSupply call — no factory or symbol/decimals calls
    expect(mockInvokeFunction).toHaveBeenCalledTimes(1);
    expect(mockInvokeFunction).toHaveBeenCalledWith(
      "0xd2a4cff31913016155e38e474a2c06d08be276cf",
      "totalSupply",
      []
    );
  });

  it("falls back to supply 0 when GAS totalSupply call fails", async () => {
    vi.mocked(mockInvokeFunction).mockRejectedValueOnce(new Error("FAULT"));

    const result = await resolveTokenMetadata(
      "0xd2a4cff31913016155e38e474a2c06d08be276cf"
    );

    expect(result.symbol).toBe("GAS");
    expect(result.supply).toBe(0n);
    expect(result.isNative).toBe(true);
  });

  it("uses contract data when factory Array has wrong format", async () => {
    // Factory returns Array with too few elements
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(haltResult([{ type: "Array", value: [] }]))
      // Direct calls: symbol, decimals, totalSupply
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("SYM") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "4" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000000" }]));

    const result = await resolveTokenMetadata("0xabc");

    // Factory data is null (bad format), falls back to contract
    expect(result.symbol).toBe("SYM");
    expect(result.name).toBe("SYM"); // symbol used as name
    expect(result.creator).toBeNull();
  });

  it("handles totalSupply returned as ByteString (little-endian) without crashing decimals", async () => {
    // Neo VM sometimes returns integers as ByteString (little-endian bytes).
    // 1,000,000 (0x0F4240) little-endian base64: bytes [0x40, 0x42, 0x0F] → btoa from chars
    const leBytes = new Uint8Array([0x40, 0x42, 0x0f]);
    const supplyByteString = btoa(String.fromCharCode(...leBytes)); // "QEIP"

    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(haltResult([{ type: "Any", value: null }])) // not in factory
      // Direct calls: symbol, decimals, totalSupply-as-ByteString
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("TOK") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: supplyByteString }]));

    const result = await resolveTokenMetadata("0xdef");

    // Must NOT throw — decimals must resolve correctly even when supply is a ByteString
    expect(result.symbol).toBe("TOK");
    expect(result.decimals).toBe(8);
    expect(result.supply).toBe(1_000_000n);
  });
});
