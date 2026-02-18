/**
 * TokenMetadataService — resolves full token metadata using a fallback chain.
 *
 * 1. Try factory GetToken() — has creator, mode, tier, createdAt
 * 2. Try token contract directly — has symbol, name, decimals, totalSupply
 * 3. If both fail — return minimal stub (contractHash only, all others null/default)
 *
 * Factory data takes priority for fields present in both sources.
 */

import { FACTORY_CONTRACT_HASH } from "./forge-config";
import { invokeFunction } from "./neo-rpc-client";
import type { RpcStackItem, TokenInfo } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Decodes a base64-encoded little-endian UInt160 to a 0x-prefixed hex string. */
function decodeHash(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const hex = [...bytes]
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/** Decodes a base64-encoded UTF-8 string. */
function decodeStr(base64: string): string {
  return atob(base64);
}

function peek(stack: RpcStackItem[]): RpcStackItem | undefined {
  return stack[0];
}

/**
 * Parses the factory GetToken() result.
 * Expected Array format: [symbol, name, creator, supply, decimals, mode, tier, createdAt]
 * Returns null if the token is not registered (stack[0] is Null/Any).
 */
function parseFactoryToken(
  contractHash: string,
  stack: RpcStackItem[]
): Partial<TokenInfo> | null {
  const top = peek(stack);
  if (!top || top.type !== "Array") return null;

  const v = top.value as RpcStackItem[];
  if (!v || v.length < 6) return null;

  try {
    return {
      contractHash,
      symbol: decodeStr(v[0].value as string),
      name: decodeStr(v[1].value as string),
      creator: decodeHash(v[2].value as string),
      supply: BigInt(v[3].value as string),
      decimals: Number(v[4].value as string),
      mode: decodeStr(v[5].value as string) as "community" | "premium",
      tier: Number(v[6]?.value ?? "0"),
      createdAt: Number(v[7]?.value ?? "0"),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves full token metadata using the fallback chain.
 * Never throws — falls back to an empty stub if all sources fail.
 */
export async function resolveTokenMetadata(
  contractHash: string
): Promise<TokenInfo> {
  // Step 1: Factory registry
  let factoryData: Partial<TokenInfo> | null = null;
  try {
    const result = await invokeFunction(FACTORY_CONTRACT_HASH, "GetToken", [
      { type: "Hash160", value: contractHash },
    ]);
    factoryData = parseFactoryToken(contractHash, result.stack);
  } catch {
    // Factory call failed — proceed to fallback
  }

  // Step 2: Token contract direct calls
  let contractData: Partial<TokenInfo> | null = null;
  try {
    const [symResult, nameResult, decResult, supplyResult] = await Promise.all([
      invokeFunction(contractHash, "symbol", []),
      invokeFunction(contractHash, "name", []),
      invokeFunction(contractHash, "decimals", []),
      invokeFunction(contractHash, "totalSupply", []),
    ]);

    contractData = {
      contractHash,
      symbol: decodeStr(peek(symResult.stack)?.value as string ?? ""),
      name: decodeStr(peek(nameResult.stack)?.value as string ?? ""),
      decimals: Number(peek(decResult.stack)?.value ?? 0),
      supply: BigInt((peek(supplyResult.stack)?.value as string) ?? "0"),
    };
  } catch {
    // Contract calls failed
  }

  // Step 3: Merge — factory takes priority
  if (!factoryData && !contractData) {
    return {
      contractHash,
      symbol: "",
      name: "",
      creator: null,
      supply: 0n,
      decimals: 0,
      mode: null,
      tier: null,
      createdAt: null,
    };
  }

  return {
    contractHash,
    symbol: factoryData?.symbol ?? contractData?.symbol ?? "",
    name: factoryData?.name ?? contractData?.name ?? "",
    creator: factoryData?.creator ?? null,
    supply: factoryData?.supply ?? contractData?.supply ?? 0n,
    decimals: factoryData?.decimals ?? contractData?.decimals ?? 0,
    mode: factoryData?.mode ?? null,
    tier: factoryData?.tier ?? null,
    createdAt: factoryData?.createdAt ?? null,
  };
}
