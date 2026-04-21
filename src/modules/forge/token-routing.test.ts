import { describe, expect, it } from "vitest";
import {
  isLeanTokenProfile,
  resolveTokenOwnerMutationRoute,
  resolveTokenRuntimeRoute,
} from "./token-routing";

describe("token-routing", () => {
  it("keeps full tokens on the dedicated contract hash without engine routing", () => {
    const route = resolveTokenRuntimeRoute({
      contractHash: "0xfull",
      tokenProfile: "full-nep17",
    });

    expect(route).toEqual({
      tokenProfile: "full-nep17",
      walletContractHash: "0xfull",
      transferQuoteScriptHash: "0xfull",
      tokenId: null,
      leanEngineHash: null,
    });
  });

  it("uses the facade hash as LEAN wallet identity and token id by default", () => {
    const route = resolveTokenRuntimeRoute({
      contractHash: "0xfacade",
      tokenProfile: "lean-nep17",
      leanEngineHash: "0xengine",
    });

    expect(route).toEqual({
      tokenProfile: "lean-nep17",
      walletContractHash: "0xfacade",
      transferQuoteScriptHash: "0xfacade",
      tokenId: "0xfacade",
      leanEngineHash: "0xengine",
    });
  });

  it("routes owner mutations through factory for full tokens and facade for LEAN tokens", () => {
    const fullRoute = resolveTokenOwnerMutationRoute(
      { contractHash: "0xfull", tokenProfile: "full-nep17" },
      "0xfactory"
    );
    const leanRoute = resolveTokenOwnerMutationRoute(
      {
        contractHash: "0xfacade",
        tokenProfile: "lean-nep17",
        tokenId: "0xfacade",
        leanEngineHash: "0xengine",
      },
      "0xfactory"
    );

    expect(fullRoute).toEqual({
      ownerMutationTarget: "factory",
      scriptHash: "0xfactory",
      tokenHashArgRequired: true,
      tokenId: null,
      leanEngineHash: null,
    });
    expect(leanRoute).toEqual({
      ownerMutationTarget: "token",
      scriptHash: "0xfacade",
      tokenHashArgRequired: false,
      tokenId: "0xfacade",
      leanEngineHash: "0xengine",
    });
  });

  it("identifies only the finalized lean-nep17 profile as LEAN", () => {
    expect(isLeanTokenProfile("lean-nep17")).toBe(true);
    expect(isLeanTokenProfile("full-nep17")).toBe(false);
    expect(isLeanTokenProfile(null)).toBe(false);
  });
});
