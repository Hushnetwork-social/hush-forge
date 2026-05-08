import { describe, expect, it } from "vitest";
import { GAS_CONTRACT_HASH } from "./forge-config";
import {
  addressToScriptHash,
  buildForgeTokenCreationRequest,
} from "./wallet-invocation-requests";
import type { ForgeParams } from "./types";

describe("wallet invocation requests", () => {
  it("keeps an existing 0x script hash unchanged", () => {
    const hash = "0x1111111111111111111111111111111111111111";
    expect(addressToScriptHash(hash)).toBe(hash);
  });

  it("builds the Forge token creation GAS transfer request", () => {
    const forgeParams: ForgeParams = {
      name: "HUSH Token",
      symbol: "HUSH",
      supply: 21_000_000n,
      decimals: 8,
      mode: "community",
      imageUrl: "https://example.test/hush.png",
      creatorFeeRate: 123,
    };

    const request = buildForgeTokenCreationRequest({
      fromAddress: "0x1111111111111111111111111111111111111111",
      factoryHash: "0x2222222222222222222222222222222222222222",
      feeAmount: 10_000_000n,
      forgeParams,
    });

    expect(request).toEqual({
      scriptHash: GAS_CONTRACT_HASH,
      operation: "transfer",
      args: [
        {
          type: "Hash160",
          value: "0x1111111111111111111111111111111111111111",
        },
        {
          type: "Hash160",
          value: "0x2222222222222222222222222222222222222222",
        },
        { type: "Integer", value: "10000000" },
        {
          type: "Array",
          value: [
            { type: "String", value: "HUSH Token" },
            { type: "String", value: "HUSH" },
            { type: "Integer", value: "21000000" },
            { type: "Integer", value: "8" },
            { type: "String", value: "community" },
            { type: "String", value: "https://example.test/hush.png" },
            { type: "Integer", value: "123" },
          ],
        },
      ],
      signers: [
        {
          account: "0x1111111111111111111111111111111111111111",
          scopes: "CalledByEntry",
        },
      ],
      description: "Forge token: HUSH Token (HUSH)",
    });
  });

  it("uses stable defaults for optional token metadata fields", () => {
    const request = buildForgeTokenCreationRequest({
      fromAddress: "0x1111111111111111111111111111111111111111",
      factoryHash: "0x2222222222222222222222222222222222222222",
      feeAmount: 10_000_000n,
      forgeParams: {
        name: "Plain Token",
        symbol: "PLAIN",
        supply: 100n,
        decimals: 0,
        mode: "community",
      },
    });

    const dataArg = request.args[3];

    expect(dataArg).toEqual({
      type: "Array",
      value: [
        { type: "String", value: "Plain Token" },
        { type: "String", value: "PLAIN" },
        { type: "Integer", value: "100" },
        { type: "Integer", value: "0" },
        { type: "String", value: "community" },
        { type: "String", value: "" },
        { type: "Integer", value: "0" },
      ],
    });
  });
});
