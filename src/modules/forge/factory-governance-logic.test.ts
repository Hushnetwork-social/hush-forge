import { describe, expect, it } from "vitest";
import {
  getFactoryAdminAccess,
  isGovernanceMutationLocked,
  normalizeGovernanceError,
  parseGasToDatoshi,
  validateGovernanceFeeInput,
  validatePartialClaimAmount,
} from "./factory-governance-logic";
import { addressToHash160 } from "./neo-rpc-client";
import type { ClaimableFactoryAsset } from "./types";

function makeAsset(overrides: Partial<ClaimableFactoryAsset> = {}): ClaimableFactoryAsset {
  return {
    contractHash: "0xasset",
    symbol: "GAS",
    name: "GasToken",
    amount: 250_000_000n,
    decimals: 8,
    displayAmount: "2.50000000",
    partialClaimSupported: true,
    ...overrides,
  };
}

describe("validateGovernanceFeeInput", () => {
  it("parses GAS decimals up to 8 places", () => {
    expect(parseGasToDatoshi("1.23456789")).toBe(123_456_789n);
  });

  it("rejects more than 8 decimals", () => {
    const result = validateGovernanceFeeInput("1.234567891", 0n);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/8 decimal/i);
  });

  it("allows zero but blocks no-change submissions", () => {
    const zeroResult = validateGovernanceFeeInput("0", 1n);
    expect(zeroResult.valid).toBe(true);
    expect(zeroResult.datoshi).toBe(0n);

    const noChangeResult = validateGovernanceFeeInput("0", 0n);
    expect(noChangeResult.valid).toBe(false);
    expect(noChangeResult.reason).toMatch(/no change/i);
  });

  it("blocks negative values", () => {
    const result = validateGovernanceFeeInput("-1", 0n);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/negative/i);
  });
});

describe("getFactoryAdminAccess", () => {
  it("marks owner wallet as authorized and nav-visible", () => {
    const ownerAddress = "Ndz4J8N8D3LqwW1tvf6D3K1mN7z2T7eK8r";
    const access = getFactoryAdminAccess(
      ownerAddress,
      addressToHash160(ownerAddress)
    );

    expect(access.isOwner).toBe(true);
    expect(access.navVisible).toBe(true);
    expect(access.routeAuthorized).toBe(true);
  });

  it("blocks non-owner wallets", () => {
    const ownerAddress = "Ndz4J8N8D3LqwW1tvf6D3K1mN7z2T7eK8r";
    const access = getFactoryAdminAccess(
      "NdtB8xJQ4M5omHnJ6sVasQ5qf8WvC7Tn3k",
      addressToHash160(ownerAddress)
    );

    expect(access.isOwner).toBe(false);
    expect(access.navVisible).toBe(false);
    expect(access.routeAuthorized).toBe(false);
  });
});

describe("validatePartialClaimAmount", () => {
  it("parses decimal amounts using asset decimals", () => {
    const result = validatePartialClaimAmount(makeAsset(), "1.25");
    expect(result.valid).toBe(true);
    expect(result.amountRaw).toBe(125_000_000n);
  });

  it("blocks unknown-decimal assets from partial claims", () => {
    const result = validatePartialClaimAmount(
      makeAsset({ decimals: null, partialClaimSupported: false }),
      "1"
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/unavailable/i);
  });

  it("blocks amounts above balance", () => {
    const result = validatePartialClaimAmount(makeAsset(), "3");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceed/i);
  });
});

describe("normalizeGovernanceError", () => {
  it("categorizes wallet rejection errors", () => {
    const error = new Error("User canceled the request");
    error.name = "WalletRejectedError";
    const result = normalizeGovernanceError(error);
    expect(result.category).toBe("wallet_rejected");
    expect(result.technicalDetails).toBe("User canceled the request");
  });

  it("categorizes RPC failures", () => {
    const result = normalizeGovernanceError({ type: "RPC_ERROR", description: "Network timeout" });
    expect(result.category).toBe("rpc_failure");
    expect(result.message).toMatch(/network request failed/i);
  });

  it("categorizes authorization failures", () => {
    const result = normalizeGovernanceError(new Error("Unauthorized"));
    expect(result.category).toBe("authorization");
  });
});

describe("isGovernanceMutationLocked", () => {
  it("allows the active mutation id and blocks others", () => {
    expect(isGovernanceMutationLocked("pause", "pause")).toBe(false);
    expect(isGovernanceMutationLocked("pause", "fee")).toBe(true);
    expect(isGovernanceMutationLocked(null, "fee")).toBe(false);
  });
});
