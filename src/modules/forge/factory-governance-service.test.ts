import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchClaimableFactoryAssets,
  getClaimableFactoryGasAsset,
  parseFactoryConfig,
} from "./factory-governance-service";

vi.mock("./neo-rpc-client", () => ({
  invokeFunction: vi.fn(),
  getNep17Balances: vi.fn(),
}));

vi.mock("./token-metadata-service", () => ({
  resolveTokenMetadata: vi.fn(),
}));

import { getNep17Balances } from "./neo-rpc-client";
import { resolveTokenMetadata } from "./token-metadata-service";

function b64Hash(byte: number): string {
  const bytes = new Uint8Array(20).fill(byte);
  return btoa(String.fromCharCode(...bytes));
}

describe("parseFactoryConfig", () => {
  beforeEach(() => vi.resetAllMocks());

  it("maps GetConfig fields in the documented order", () => {
    const result = parseFactoryConfig({
      state: "HALT",
      gasconsumed: "100000",
      script: "",
      stack: [
        {
          type: "Array",
          value: [
            { type: "Integer", value: "1500000000" },
            { type: "Integer", value: "50000000" },
            { type: "Boolean", value: false },
            { type: "ByteString", value: b64Hash(0x11) },
            { type: "ByteString", value: b64Hash(0x22) },
            { type: "Integer", value: "1" },
            { type: "Boolean", value: true },
            { type: "Boolean", value: false },
          ],
        },
      ],
    });

    expect(result.creationFee).toBe(1_500_000_000n);
    expect(result.operationFee).toBe(50_000_000n);
    expect(result.paused).toBe(false);
    expect(result.owner).toBe(`0x${"11".repeat(20)}`);
    expect(result.templateScriptHash).toBe(`0x${"22".repeat(20)}`);
    expect(result.templateVersion).toBe(1n);
    expect(result.templateNefStored).toBe(true);
    expect(result.templateManifestStored).toBe(false);
  });

  it("rejects config arrays with the wrong field count", () => {
    expect(() =>
      parseFactoryConfig({
        state: "HALT",
        gasconsumed: "100000",
        script: "",
        stack: [{ type: "Array", value: [{ type: "Integer", value: "1" }] }],
      })
    ).toThrow(/expected 8/i);
  });
});

describe("fetchClaimableFactoryAssets", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps only non-zero assets and maps resolved metadata", async () => {
    vi.mocked(getNep17Balances).mockResolvedValue({
      address: "Nfactory",
      balance: [
        { assethash: "0xgas", amount: "250000000", lastupdatedblock: 10 },
        { assethash: "0xzero", amount: "0", lastupdatedblock: 10 },
      ],
    });
    vi.mocked(resolveTokenMetadata).mockResolvedValue({
      contractHash: "0xgas",
      symbol: "GAS",
      name: "GasToken",
      creator: null,
      supply: 0n,
      decimals: 8,
      mode: null,
      tier: null,
      createdAt: null,
      isNative: true,
    });

    const result = await fetchClaimableFactoryAssets("Nfactory");

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("GAS");
    expect(result[0].displayAmount).toBe("2.50000000");
    expect(result[0].partialClaimSupported).toBe(true);
  });

  it("keeps unresolved assets with fallback label and disables partial claims", async () => {
    vi.mocked(getNep17Balances).mockResolvedValue({
      address: "Nfactory",
      balance: [{ assethash: "0xabc", amount: "42", lastupdatedblock: 10 }],
    });
    vi.mocked(resolveTokenMetadata).mockRejectedValue(new Error("metadata failed"));

    const result = await fetchClaimableFactoryAssets("Nfactory");

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("Unknown Asset");
    expect(result[0].displayAmount).toBe("42");
    expect(result[0].partialClaimSupported).toBe(false);
  });
});

describe("getClaimableFactoryGasAsset", () => {
  it("returns the GAS asset when present", () => {
    const gasAsset = {
      contractHash: "0xd2a4cff31913016155e38e474a2c06d08be276cf",
      symbol: "GAS",
      name: "GasToken",
      amount: 250_000_000n,
      decimals: 8,
      displayAmount: "2.50000000",
      partialClaimSupported: true,
    };

    const result = getClaimableFactoryGasAsset([
      {
        contractHash: "0xabc",
        symbol: "HUSH",
        name: "HushToken",
        amount: 1_000n,
        decimals: 8,
        displayAmount: "0.00001000",
        partialClaimSupported: true,
      },
      gasAsset,
    ]);

    expect(result).toEqual(gasAsset);
  });

  it("returns null when the claimable asset list does not contain GAS", () => {
    const result = getClaimableFactoryGasAsset([
      {
        contractHash: "0xabc",
        symbol: "HUSH",
        name: "HushToken",
        amount: 1_000n,
        decimals: 8,
        displayAmount: "0.00001000",
        partialClaimSupported: true,
      },
    ]);

    expect(result).toBeNull();
  });
});
