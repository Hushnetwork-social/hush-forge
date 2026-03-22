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
 *   [symbol, creator, supply, mode, tier, createdAt, imageUrl, burnRate?, maxSupply?, locked?]
 * Note: name and decimals are NOT stored by the factory.
 */
function factoryArrayResult(
  symbol: string,
  creatorByte: number,
  supply: string,
  mode: string,
  tier: string,
  createdAt: string,
  imageUrl = "",
  burnRate?: string,
  maxSupply?: string,
  locked?: string
): HaltResult {
  const items: { type: string; value: unknown }[] = [
    { type: "ByteString", value: b64(symbol) },
    { type: "ByteString", value: b64Hash(creatorByte) },
    { type: "Integer", value: supply },
    { type: "ByteString", value: b64(mode) },
    { type: "ByteString", value: b64(tier) },
    { type: "Integer", value: createdAt },
    { type: "ByteString", value: b64(imageUrl) },
  ];
  if (burnRate !== undefined) items.push({ type: "Integer", value: burnRate });
  if (maxSupply !== undefined) items.push({ type: "Integer", value: maxSupply });
  if (locked !== undefined) items.push({ type: "Integer", value: locked });
  return haltResult([{ type: "Array", value: items }]);
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
      // Direct contract calls: symbol, getName, decimals, totalSupply
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("HUSH") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("HushToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "10000000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.symbol).toBe("HUSH");
    // name comes from getName() — factory doesn't store it
    expect(result.name).toBe("HushToken");
    expect(result.creator).toBe(expectedHash(0xab));
    expect(result.supply).toBe(10_000_000n); // from factory (authoritative)
    expect(result.decimals).toBe(8); // from direct decimals() call
    expect(result.mode).toBe("community");
    expect(result.tier).toBeNull(); // "standard" string → not a number → null
    expect(result.createdAt).toBe(1_234_567_890);
  });

  it("parses imageUrl from factory registry at index 6", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("ICN", 0xab, "1000", "community", "standard", "1234567890", "https://example.com/icon.png")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("ICN") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("IconToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.imageUrl).toBe("https://example.com/icon.png");
  });

  it("imageUrl is undefined when factory stores empty string", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("NIC", 0xab, "1000", "community", "standard", "1234567890", "")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("NIC") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("NicToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.imageUrl).toBeUndefined();
  });

  it("falls back to contract when factory does not have the token", async () => {
    vi.mocked(mockInvokeFunction)
      // getToken returns null/empty stack (not in registry)
      .mockResolvedValueOnce(haltResult([{ type: "Any", value: null }]))
      // Direct contract calls: symbol, getName, decimals, totalSupply
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("OTHER") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("OtherToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "0" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "999" }]));

    const result = await resolveTokenMetadata("0xabc");

    expect(result.symbol).toBe("OTHER");
    // name comes from getName()
    expect(result.name).toBe("OtherToken");
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

  it("parses burnRate from factory registry at index 7", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("BRN", 0xab, "1000", "community", "1", "100", "", "200")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("BRN") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("BurnToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "200" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xbrn");
    expect(result.burnRate).toBe(200);
  });

  it("parses maxSupply as string from factory registry at index 8", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("MAX", 0xab, "1000", "community", "1", "100", "", "0", "1000000000000000000")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("MAX") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("MaxToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xmax");
    expect(result.maxSupply).toBe("1000000000000000000");
  });

  it("parses locked=true when factory registry index 9 = 1", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("LCK", 0xab, "1000", "community", "1", "100", "", "0", "0", "1")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("LCK") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("LockToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xlck");
    expect(result.locked).toBe(true);
  });

  it("parses locked=false when factory registry index 9 = 0", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("ULK", 0xab, "1000", "community", "1", "100", "", "0", "0", "0")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("ULK") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("UnlockToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xulk");
    expect(result.locked).toBe(false);
  });

  it("backward-compatible: defaults burnRate=0 maxSupply='0' locked=false for 7-element tokenInfo", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("OLD", 0xab, "5000", "community", "1", "100")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("OLD") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("OldToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "5000" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xold");
    expect(result.burnRate).toBe(0);
    expect(result.maxSupply).toBe("0");
    expect(result.locked).toBe(false);
  });

  it("uses contract data when factory Array has wrong format", async () => {
    // Factory returns Array with too few elements
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(haltResult([{ type: "Array", value: [] }]))
      // Direct calls: symbol, getName, decimals, totalSupply
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("SYM") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("SymToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "4" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000000" }]));

    const result = await resolveTokenMetadata("0xabc");

    // Factory data is null (bad format), falls back to contract
    expect(result.symbol).toBe("SYM");
    expect(result.name).toBe("SymToken"); // getName() result used
    expect(result.creator).toBeNull();
  });

  it("handles totalSupply returned as ByteString (little-endian) without crashing decimals", async () => {
    // Neo VM sometimes returns integers as ByteString (little-endian bytes).
    // 1,000,000 (0x0F4240) little-endian base64: bytes [0x40, 0x42, 0x0F] → btoa from chars
    const leBytes = new Uint8Array([0x40, 0x42, 0x0f]);
    const supplyByteString = btoa(String.fromCharCode(...leBytes)); // "QEIP"

    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(haltResult([{ type: "Any", value: null }])) // not in factory
      // Direct calls: symbol, getName, decimals, totalSupply-as-ByteString
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("TOK") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("TokToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: supplyByteString }]));

    const result = await resolveTokenMetadata("0xdef");

    // Must NOT throw — decimals must resolve correctly even when supply is a ByteString
    expect(result.symbol).toBe("TOK");
    expect(result.decimals).toBe(8);
    expect(result.supply).toBe(1_000_000n);
  });

  it("loads creator and platform fee rates for factory tokens", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("FEE", 0xab, "1000", "community", "1", "100")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("FEE") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("FeeToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "25" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "150000" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "250000" }]));

    const result = await resolveTokenMetadata("0xfee");

    expect(result.burnRate).toBe(25);
    expect(result.creatorFeeRate).toBe(150000);
    expect(result.platformFeeRate).toBe(250000);
  });

  it("keeps explicit zero economics values for zero-config factory tokens", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("ZER", 0xab, "1000", "community", "1", "100")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("ZER") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("ZeroToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "0" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "0" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xzer");

    expect(result.burnRate).toBe(0);
    expect(result.creatorFeeRate).toBe(0);
    expect(result.platformFeeRate).toBe(0);
  });

  it("leaves economics undefined for non-factory tokens", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(haltResult([{ type: "Any", value: null }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("EXT") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("ExternalToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "5000" }]));

    const result = await resolveTokenMetadata("0xext");

    expect(result.burnRate).toBeUndefined();
    expect(result.creatorFeeRate).toBeUndefined();
    expect(result.platformFeeRate).toBeUndefined();
  });

  it("prefers live totalSupply over stale factory registry supply", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("SUP", 0xab, "1000", "community", "1", "100")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("SUP") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("SupplyToken") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "750" }]))
      .mockResolvedValue(haltResult([{ type: "Integer", value: "0" }]));

    const result = await resolveTokenMetadata("0xsup");

    expect(result.supply).toBe(750n);
  });

  it("falls back to factory burnRate when the live getter is unavailable", async () => {
    vi.mocked(mockInvokeFunction)
      .mockResolvedValueOnce(
        factoryArrayResult("FBR", 0xab, "1000", "community", "1", "100", "", "125")
      )
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("FBR") }]))
      .mockResolvedValueOnce(haltResult([{ type: "ByteString", value: b64("FallbackBurn") }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "8" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "1000" }]))
      .mockRejectedValueOnce(new Error("burn getter unavailable"))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "100000" }]))
      .mockResolvedValueOnce(haltResult([{ type: "Integer", value: "200000" }]));

    const result = await resolveTokenMetadata("0xfbr");

    expect(result.burnRate).toBe(125);
    expect(result.creatorFeeRate).toBe(100000);
    expect(result.platformFeeRate).toBe(200000);
  });
});
