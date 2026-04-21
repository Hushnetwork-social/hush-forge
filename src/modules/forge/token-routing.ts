import type {
  TokenInfo,
  TokenOwnerMutationTarget,
  TokenProfile,
} from "./types";

type TokenRoutingInput = Pick<
  TokenInfo,
  "contractHash" | "tokenProfile" | "tokenId" | "leanEngineHash"
>;

export interface TokenRuntimeRoute {
  tokenProfile: TokenProfile | null;
  walletContractHash: string;
  transferQuoteScriptHash: string;
  tokenId: string | null;
  leanEngineHash: string | null;
}

export interface TokenOwnerMutationRoute {
  ownerMutationTarget: TokenOwnerMutationTarget;
  scriptHash: string;
  tokenHashArgRequired: boolean;
  tokenId: string | null;
  leanEngineHash: string | null;
}

export function isLeanTokenProfile(
  tokenProfile?: TokenProfile | null
): boolean {
  return tokenProfile === "lean-nep17";
}

export function resolveTokenRuntimeRoute(
  token: TokenRoutingInput
): TokenRuntimeRoute {
  const lean = isLeanTokenProfile(token.tokenProfile);

  return {
    tokenProfile: token.tokenProfile ?? null,
    walletContractHash: token.contractHash,
    transferQuoteScriptHash: token.contractHash,
    tokenId: lean ? token.tokenId ?? token.contractHash : null,
    leanEngineHash: lean ? token.leanEngineHash ?? null : null,
  };
}

export function resolveTokenOwnerMutationRoute(
  token: TokenRoutingInput,
  factoryHash: string
): TokenOwnerMutationRoute {
  const runtimeRoute = resolveTokenRuntimeRoute(token);
  const lean = isLeanTokenProfile(runtimeRoute.tokenProfile);

  if (lean) {
    return {
      ownerMutationTarget: "token",
      scriptHash: runtimeRoute.walletContractHash,
      tokenHashArgRequired: false,
      tokenId: runtimeRoute.tokenId,
      leanEngineHash: runtimeRoute.leanEngineHash,
    };
  }

  return {
    ownerMutationTarget: "factory",
    scriptHash: factoryHash,
    tokenHashArgRequired: true,
    tokenId: null,
    leanEngineHash: null,
  };
}
