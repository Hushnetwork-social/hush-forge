import { beforeEach, describe, expect, it, vi } from "vitest";
import { quoteChangeModeCost } from "./token-admin-cost-service";

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
