/**
 * TokenMetadataService — resolves full token metadata using a fallback chain.
 *
 * 0. Known native Neo N3 contracts (NEO, GAS) — return static metadata, no RPC
 * 1. Try factory GetToken() — has creator, mode, tier, createdAt
 * 2. Try token contract directly — has symbol, name, decimals, totalSupply
 * 3. If both fail — return minimal stub (contractHash only, all others null/default)
 *
 * Factory data takes priority for fields present in both sources.
 */

import { getRuntimeFactoryHash } from "./forge-config";
import { invokeFunction } from "./neo-rpc-client";
import type { RpcStackItem, TokenInfo } from "./types";

// ---------------------------------------------------------------------------
// Native Neo N3 contracts — these don't expose standard NEP-17 methods via
// invokefunction on all node implementations, so we return static metadata.
// ---------------------------------------------------------------------------

interface NativeSpec extends Omit<TokenInfo, "contractHash" | "supply"> {
  supply: bigint; // static fallback
  fetchSupply: boolean; // if true, try a live totalSupply() RPC call
}

const NATIVE_TOKENS: Readonly<Record<string, NativeSpec>> = {
  "0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5": {
    symbol: "NEO",
    name: "NeoToken",
    decimals: 0,
    supply: 100_000_000n, // fixed — 100 million, indivisible
    fetchSupply: false,
    creator: null,
    mode: null,
    tier: null,
    createdAt: null,
    isNative: true,
  },
  "0xd2a4cff31913016155e38e474a2c06d08be276cf": {
    symbol: "GAS",
    name: "GasToken",
    decimals: 8,
    supply: 0n, // dynamic — fetched live below
    fetchSupply: true,
    creator: null,
    mode: null,
    tier: null,
    createdAt: null,
    isNative: true,
  },
};

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

/**
 * Parses a Neo RPC stack item that represents an integer (supply, etc.).
 * Neo VM may return integers as type "Integer" or as type "ByteString"
 * (little-endian encoded bytes). Handles both gracefully.
 */
function parseStackItemAsBigInt(item: RpcStackItem | undefined): bigint {
  if (!item) return 0n;
  if (item.type === "Integer") {
    try {
      return BigInt(item.value as string);
    } catch {
      return 0n;
    }
  }
  if (item.type === "ByteString") {
    // Integers returned as ByteString are little-endian encoded
    try {
      const bytes = Uint8Array.from(atob(item.value as string), (c) =>
        c.charCodeAt(0)
      );
      if (bytes.length === 0) return 0n;
      let result = 0n;
      for (let i = bytes.length - 1; i >= 0; i--) {
        result = (result << 8n) | BigInt(bytes[i]);
      }
      return result;
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function peek(stack: RpcStackItem[]): RpcStackItem | undefined {
  return stack[0];
}

/**
 * Parses the factory getToken() result.
 * Actual Array format returned by the contract:
 *   [symbol, creator, supply, mode, tier, createdAt, imageUrl]
 * Note: name and decimals are NOT stored by the factory — fetch from the token
 * contract directly via symbol() and decimals().
 * Returns null if the token is not registered (stack[0] is Null/Any).
 */
function parseFactoryToken(
  contractHash: string,
  stack: RpcStackItem[]
): Partial<TokenInfo> | null {
  const top = peek(stack);
  if (!top || top.type !== "Array") return null;

  const v = top.value as RpcStackItem[];
  if (!v || v.length < 4) return null;

  try {
    return {
      contractHash,
      symbol: decodeStr(v[0].value as string),
      // name not stored in factory — will be filled from direct contract call
      creator: decodeHash(v[1].value as string),
      supply: BigInt(v[2].value as string),
      mode: decodeStr(v[3].value as string) as "community" | "premium",
      tier: v[4] !== undefined ? Number(v[4].value) || null : null,
      createdAt: v[5] !== undefined ? Number(v[5].value) || null : null,
      imageUrl: v[6] !== undefined ? decodeStr(v[6].value as string) || undefined : undefined,
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
  // Step 0: Known native contracts — no factory/contract calls needed
  const nativeSpec = NATIVE_TOKENS[contractHash.toLowerCase()];
  if (nativeSpec) {
    const { fetchSupply, ...baseData } = nativeSpec;
    let supply = baseData.supply;
    if (fetchSupply) {
      try {
        const result = await invokeFunction(contractHash, "totalSupply", []);
        const val = result.stack[0]?.value;
        if (val !== undefined) supply = BigInt(val as string);
      } catch {
        // keep static fallback (0n for GAS)
      }
    }
    return { contractHash, ...baseData, supply };
  }

  // Step 1: Factory registry
  let factoryData: Partial<TokenInfo> | null = null;
  try {
    const result = await invokeFunction(getRuntimeFactoryHash(), "getToken", [
      { type: "Hash160", value: contractHash },
    ]);
    console.log("[metadata] factory GetToken stack[0]:", JSON.stringify(result.stack[0]));
    factoryData = parseFactoryToken(contractHash, result.stack);
  } catch (err) {
    console.warn("[metadata] factory GetToken failed for", contractHash, ":", String(err));
  }

  // Step 2: Token contract direct calls.
  // Use allSettled so one FAULT or network failure doesn't prevent the other
  // calls from loading. Decimals must survive even if totalSupply() fails.
  // TokenTemplate exposes getName() (camelCase) — NOT the standard name() method.
  let contractData: Partial<TokenInfo> | null = null;
  try {
    const [symSettled, nameSettled, decSettled, supSettled] = await Promise.allSettled([
      invokeFunction(contractHash, "symbol", []),
      invokeFunction(contractHash, "getName", []),
      invokeFunction(contractHash, "decimals", []),
      invokeFunction(contractHash, "totalSupply", []),
    ]);

    if (decSettled.status === "rejected") {
      console.warn("[metadata] decimals() failed for", contractHash, ":", String(decSettled.reason));
    }

    const symbol =
      symSettled.status === "fulfilled"
        ? decodeStr(peek(symSettled.value.stack)?.value as string ?? "")
        : "";
    const name =
      nameSettled.status === "fulfilled"
        ? decodeStr(peek(nameSettled.value.stack)?.value as string ?? "")
        : symbol; // fallback to symbol if getName() not available
    const decimals =
      decSettled.status === "fulfilled"
        ? Number(peek(decSettled.value.stack)?.value ?? 0)
        : 0;
    const supply =
      supSettled.status === "fulfilled"
        ? parseStackItemAsBigInt(peek(supSettled.value.stack))
        : 0n;

    console.log("[metadata] direct calls for", contractHash, "— sym:", symbol, "name:", name, "dec:", decimals);
    contractData = {
      contractHash,
      symbol,
      name: name || symbol,
      decimals,
      supply,
    };
  } catch (err) {
    console.warn("[metadata] direct contract calls failed for", contractHash, ":", String(err));
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

  const symbol = factoryData?.symbol ?? contractData?.symbol ?? "";
  return {
    contractHash,
    symbol,
    // Factory does not store name — use getName() result from direct call, fallback to symbol
    name: contractData?.name ?? symbol,
    creator: factoryData?.creator ?? null,
    // Factory supply is authoritative (stored at creation time)
    supply: factoryData?.supply ?? contractData?.supply ?? 0n,
    // Factory does not store decimals — must come from direct contract call
    decimals: contractData?.decimals ?? 0,
    mode: factoryData?.mode ?? null,
    tier: factoryData?.tier ?? null,
    createdAt: factoryData?.createdAt ?? null,
    imageUrl: factoryData?.imageUrl,
  };
}
