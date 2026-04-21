import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  quoteChangeModeCost,
  quoteTokenOwnerMutationCost,
  resolveTokenOwnerMutationCall,
} from "./token-admin-cost-service";

const addressToHash160 = vi.fn();
const invokeScript = vi.fn();
const getBlockCount = vi.fn();
const calculateNetworkFee = vi.fn();

vi.mock("./neo-rpc-client", () => ({
  addressToHash160: (...args: unknown[]) => addressToHash160(...args),
  invokeScript: (...args: unknown[]) => invokeScript(...args),
  getBlockCount: (...args: unknown[]) => getBlockCount(...args),
  calculateNetworkFee: (...args: unknown[]) => calculateNetworkFee(...args),
}));

describe("quoteChangeModeCost", () => {
  beforeEach(() => {
    addressToHash160.mockReset();
    addressToHash160.mockReturnValue(
      "0x3333333333333333333333333333333333333333"
    );
    invokeScript.mockReset();
    invokeScript.mockResolvedValue({
      state: "HALT",
      gasconsumed: "1000",
      script: "abc",
      stack: [],
    });
    getBlockCount.mockReset();
    getBlockCount.mockResolvedValue(5000);
    calculateNetworkFee.mockReset();
    calculateNetworkFee.mockResolvedValue(250n);
  });

  it("returns operation fee, chain fee, and total outflow for changeTokenMode", async () => {
    const result = await quoteChangeModeCost(
      "Nowner",
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "speculation",
      ["GAS", "600"],
      50_000_000n
    );

    expect(addressToHash160).toHaveBeenCalledWith("Nowner");
    expect(invokeScript).toHaveBeenCalledWith(expect.any(String), [
      { account: "0x3333333333333333333333333333333333333333", scopes: "Global" },
    ]);
    expect(calculateNetworkFee).toHaveBeenCalled();
    expect(result).toEqual({
      operationFeeDatoshi: 50_000_000n,
      estimatedSystemFeeDatoshi: 1100n,
      estimatedNetworkFeeDatoshi: 250n,
      estimatedChainFeeDatoshi: 1350n,
      estimatedTotalWalletOutflowDatoshi: 50_001_350n,
    });
  });
});

describe("resolveTokenOwnerMutationCall", () => {
  it("maps full token owner mutations to factory methods with token hash arg", () => {
    const call = resolveTokenOwnerMutationCall(
      "0x1111111111111111111111111111111111111111",
      {
        contractHash: "0x2222222222222222222222222222222222222222",
        tokenProfile: "full-nep17",
      },
      "setBurnRate",
      [{ type: "Integer", value: 200 }]
    );

    expect(call).toMatchObject({
      scriptHash: "0x1111111111111111111111111111111111111111",
      operation: "setTokenBurnRate",
      ownerMutationTarget: "factory",
      tokenHashArgRequired: true,
      tokenId: null,
      leanEngineHash: null,
    });
    expect(call.args).toEqual([
      { type: "Hash160", value: "0x2222222222222222222222222222222222222222" },
      { type: "Integer", value: 200 },
    ]);
  });

  it("maps LEAN token owner mutations to the facade and keeps token id routing metadata", () => {
    const call = resolveTokenOwnerMutationCall(
      "0x1111111111111111111111111111111111111111",
      {
        contractHash: "0x2222222222222222222222222222222222222222",
        tokenProfile: "lean-nep17",
        tokenId: "0x2222222222222222222222222222222222222222",
        leanEngineHash: "0x3333333333333333333333333333333333333333",
      },
      "setBurnRate",
      [{ type: "Integer", value: 200 }]
    );

    expect(call).toMatchObject({
      scriptHash: "0x2222222222222222222222222222222222222222",
      operation: "setBurnRate",
      ownerMutationTarget: "token",
      tokenHashArgRequired: false,
      tokenId: "0x2222222222222222222222222222222222222222",
      leanEngineHash: "0x3333333333333333333333333333333333333333",
    });
    expect(call.args).toEqual([{ type: "Integer", value: 200 }]);
  });
});

describe("quoteTokenOwnerMutationCost", () => {
  beforeEach(() => {
    addressToHash160.mockReset();
    addressToHash160.mockReturnValue(
      "0x3333333333333333333333333333333333333333"
    );
    invokeScript.mockReset();
    invokeScript.mockResolvedValue({
      state: "HALT",
      gasconsumed: "2000",
      script: "abc",
      stack: [],
    });
    getBlockCount.mockReset();
    getBlockCount.mockResolvedValue(5000);
    calculateNetworkFee.mockReset();
    calculateNetworkFee.mockResolvedValue(500n);
  });

  it("quotes LEAN token-local owner mutation chain fees", async () => {
    const result = await quoteTokenOwnerMutationCost(
      "Nowner",
      "0x1111111111111111111111111111111111111111",
      {
        contractHash: "0x2222222222222222222222222222222222222222",
        tokenProfile: "lean-nep17",
        tokenId: "0x2222222222222222222222222222222222222222",
        leanEngineHash: "0x3333333333333333333333333333333333333333",
      },
      "setCreatorFee",
      [{ type: "Integer", value: 1_000_000 }],
      0n
    );

    expect(invokeScript).toHaveBeenCalledWith(expect.any(String), [
      { account: "0x3333333333333333333333333333333333333333", scopes: "Global" },
    ]);
    expect(result).toEqual({
      operationFeeDatoshi: 0n,
      estimatedSystemFeeDatoshi: 2200n,
      estimatedNetworkFeeDatoshi: 500n,
      estimatedChainFeeDatoshi: 2700n,
      estimatedTotalWalletOutflowDatoshi: 2700n,
    });
  });
});
