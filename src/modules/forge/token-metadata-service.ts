/**
 * TokenMetadataService — resolves full token metadata using a fallback chain.
 *
 * 0. Known native Neo N3 contracts (NEO, GAS) — return static metadata, no RPC
 * 1. Try factory GetToken() — has creator, mode, tier, createdAt
 * 2. Try token contract directly — has symbol, name, decimals, totalSupply
 * 3. If both fail — return minimal stub (contractHash only, all others null/default)
 *
 * Factory registry data fills identity/ownership fields, while live token getters
 * remain authoritative for mutable economics and supply values.
 */

import { getRuntimeFactoryHash } from "./forge-config";
import { invokeFunction } from "./neo-rpc-client";
import type { RpcStackItem, TokenAuthority, TokenInfo, TokenProfile } from "./types";

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

function parseStackItemAsString(item: RpcStackItem | undefined): string {
  if (!item) return "";

  if (item.type === "ByteString" || item.type === "ByteArray") {
    try {
      return decodeStr(String(item.value ?? ""));
    } catch {
      return "";
    }
  }

  if (item.type === "String") {
    return String(item.value ?? "");
  }

  return "";
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

function parseStackItemAsBigIntOrUndefined(item: RpcStackItem | undefined): bigint | undefined {
  return item ? parseStackItemAsBigInt(item) : undefined;
}

function parseStackItemAsNumber(item: RpcStackItem | undefined): number | undefined {
  if (!item) return undefined;

  if (item.type === "Integer") {
    try {
      return Number(BigInt(String(item.value)));
    } catch {
      return undefined;
    }
  }

  if (item.type === "ByteString") {
    try {
      const bytes = Uint8Array.from(atob(item.value as string), (c) =>
        c.charCodeAt(0)
      );
      if (bytes.length === 0) return 0;
      let result = 0n;
      for (let i = bytes.length - 1; i >= 0; i--) {
        result = (result << 8n) | BigInt(bytes[i]);
      }
      return Number(result);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseStackItemAsBoolean(item: RpcStackItem | undefined): boolean | undefined {
  if (!item) return undefined;

  if (item.type === "Boolean") return Boolean(item.value);

  const value = parseStackItemAsNumber(item);
  return value === undefined ? undefined : value !== 0;
}

function peek(stack: RpcStackItem[]): RpcStackItem | undefined {
  return stack[0];
}

function normalizeFactoryMode(mode: string): TokenInfo["mode"] {
  switch (mode) {
    case "speculation":
      return "speculative";
    case "crowdfunding":
      return "crowdfund";
    case "community":
    case "speculative":
    case "crowdfund":
    case "premium":
      return mode;
    default:
      return null;
  }
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
      mode: normalizeFactoryMode(decodeStr(v[3].value as string)),
      tier: v[4] !== undefined ? Number(v[4].value) || null : null,
      createdAt: v[5] !== undefined ? Number(v[5].value) || null : null,
      imageUrl: v[6] !== undefined ? decodeStr(v[6].value as string) || undefined : undefined,
      burnRate: v[7] !== undefined ? Number(v[7].value) || 0 : 0,
      maxSupply: v[8] !== undefined ? String(v[8].value ?? "0") : "0",
      locked: v[9] !== undefined ? Number(v[9].value) !== 0 : false,
    };
  } catch {
    return null;
  }
}

type TokenEconomics = Pick<
  TokenInfo,
  | "burnRate"
  | "creatorFeeRate"
  | "platformFeeRate"
  | "claimableCreatorFee"
  | "maxSupply"
  | "locked"
  | "mintable"
  | "imageUrl"
>;

function stackTopFromSettled(
  settled: PromiseSettledResult<{ stack: RpcStackItem[] } | undefined>
): RpcStackItem | undefined {
  return settled.status === "fulfilled"
    ? peek(settled.value?.stack ?? [])
    : undefined;
}

async function readTokenEconomics(contractHash: string): Promise<TokenEconomics> {
  const [
    burnSettled,
    creatorFeeSettled,
    platformFeeSettled,
    claimableCreatorFeeSettled,
    maxSupplySettled,
    lockedSettled,
    mintableSettled,
    metadataUriSettled,
  ] =
    await Promise.allSettled([
      invokeFunction(contractHash, "getBurnRate", []),
      invokeFunction(contractHash, "getCreatorFeeRate", []),
      invokeFunction(contractHash, "getPlatformFeeRate", []),
      invokeFunction(contractHash, "getClaimableCreatorFee", []),
      invokeFunction(contractHash, "getMaxSupply", []),
      invokeFunction(contractHash, "isLocked", []),
      invokeFunction(contractHash, "getMintable", []),
      invokeFunction(contractHash, "getMetadataUri", []),
    ]);

  const claimableCreatorFee = parseStackItemAsBigIntOrUndefined(
    stackTopFromSettled(claimableCreatorFeeSettled)
  );
  const maxSupply = parseStackItemAsBigIntOrUndefined(
    stackTopFromSettled(maxSupplySettled)
  );
  const metadataUri = parseStackItemAsString(stackTopFromSettled(metadataUriSettled));

  return {
    burnRate: parseStackItemAsNumber(stackTopFromSettled(burnSettled)),
    creatorFeeRate: parseStackItemAsNumber(stackTopFromSettled(creatorFeeSettled)),
    platformFeeRate: parseStackItemAsNumber(stackTopFromSettled(platformFeeSettled)),
    claimableCreatorFee,
    maxSupply: maxSupply === undefined ? undefined : maxSupply.toString(),
    locked: parseStackItemAsBoolean(stackTopFromSettled(lockedSettled)),
    mintable: parseStackItemAsBoolean(stackTopFromSettled(mintableSettled)),
    imageUrl: metadataUri || undefined,
  };
}

function normalizeTokenProfile(value: string): TokenProfile | null {
  return value === "full-nep17" || value === "lean-nep17" ? value : null;
}

async function readTokenProfile(factoryHash: string, contractHash: string): Promise<TokenProfile | null> {
  const result = await invokeFunction(factoryHash, "getTokenProfile", [
    { type: "Hash160", value: contractHash },
  ]);

  return normalizeTokenProfile(parseStackItemAsString(peek(result.stack)));
}

function buildTokenAuthority(tokenProfile: TokenProfile | null): TokenAuthority | null {
  if (tokenProfile === null) return null;

  return {
    ownerMutationTarget: tokenProfile === "lean-nep17" ? "token" : "factory",
    creatorFeeEditableByOwner: true,
    burnRateEditableByOwner: true,
    platformFeeEditableByOwner: false,
    platformFeeEditableByPlatform: true,
  };
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
  const factoryHash = getRuntimeFactoryHash();
  try {
    const result = await invokeFunction(factoryHash, "getToken", [
      { type: "Hash160", value: contractHash },
    ]);
    factoryData = parseFactoryToken(contractHash, result.stack);
  } catch (err) {
    console.warn("[metadata] factory GetToken failed for", contractHash, ":", String(err));
  }

  // Step 2: Token contract direct calls.
  // Use allSettled so one FAULT or network failure doesn't prevent the other
  // calls from loading. Decimals must survive even if totalSupply() fails.
  // TokenTemplate exposes getName() (camelCase) — NOT the standard name() method.
  let contractData: Partial<TokenInfo> | null = null;
  let tokenEconomics: TokenEconomics | null = null;
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

  let tokenProfile: TokenProfile | null = null;
  if (factoryData) {
    try {
      const [economicsSettled, profileSettled] = await Promise.allSettled([
        readTokenEconomics(contractHash),
        readTokenProfile(factoryHash, contractHash),
      ]);

      tokenEconomics =
        economicsSettled.status === "fulfilled" ? economicsSettled.value : null;
      tokenProfile =
        profileSettled.status === "fulfilled" ? profileSettled.value : null;
    } catch (err) {
      console.warn("[metadata] token economics/profile calls failed for", contractHash, ":", String(err));
    }
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
    // totalSupply() is the live on-chain source of truth; factory supply may lag after burns.
    supply: contractData?.supply ?? factoryData?.supply ?? 0n,
    // Factory does not store decimals — must come from direct contract call
    decimals: contractData?.decimals ?? 0,
    mode: factoryData?.mode ?? null,
    tier: factoryData?.tier ?? null,
    createdAt: factoryData?.createdAt ?? null,
    imageUrl: tokenEconomics?.imageUrl ?? factoryData?.imageUrl,
    burnRate:
      tokenEconomics?.burnRate ??
      (factoryData ? factoryData.burnRate ?? 0 : undefined),
    maxSupply: tokenEconomics?.maxSupply ?? factoryData?.maxSupply ?? "0",
    locked: tokenEconomics?.locked ?? factoryData?.locked ?? false,
    mintable: tokenEconomics?.mintable,
    creatorFeeRate: tokenEconomics?.creatorFeeRate,
    platformFeeRate: tokenEconomics?.platformFeeRate,
    claimableCreatorFee: tokenEconomics?.claimableCreatorFee,
    tokenProfile,
    authority: buildTokenAuthority(tokenProfile),
  };
}
