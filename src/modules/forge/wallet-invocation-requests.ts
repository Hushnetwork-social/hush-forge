import { GAS_CONTRACT_HASH } from "./forge-config";
import type { ForgeParams } from "./types";

export type NeoWalletInvokeArgType =
  | "Hash160"
  | "Integer"
  | "String"
  | "Boolean"
  | "Array"
  | "ByteArray"
  | "Any";

export interface NeoWalletInvokeArg {
  type: NeoWalletInvokeArgType;
  value: unknown;
}

export interface NeoWalletSigner {
  account: string;
  scopes: "None" | "CalledByEntry" | "CustomContracts" | "CustomGroups" | "Global";
  allowedContracts?: string[];
  allowedGroups?: string[];
}

export interface NeoWalletInvocationRequest {
  scriptHash: string;
  operation: string;
  args: NeoWalletInvokeArg[];
  signers: NeoWalletSigner[];
  description: string;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Converts a Neo N3 Base58Check address to the 0x-prefixed little-endian
 * script hash expected by the existing NeoLine dAPI path.
 */
export function addressToScriptHash(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return address;
  let n = 0n;
  for (const ch of address) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  for (let i = 0; i < 25; i++) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const hashBytes = bytes.slice(1, 21).reverse();
  return "0x" + hashBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildForgeTokenCreationRequest(params: {
  fromAddress: string;
  factoryHash: string;
  feeAmount: bigint;
  forgeParams: ForgeParams;
}): NeoWalletInvocationRequest {
  const fromAccount = addressToScriptHash(params.fromAddress);

  return {
    scriptHash: GAS_CONTRACT_HASH,
    operation: "transfer",
    args: [
      { type: "Hash160", value: fromAccount },
      { type: "Hash160", value: params.factoryHash },
      { type: "Integer", value: params.feeAmount.toString() },
      {
        type: "Array",
        value: [
          { type: "String", value: params.forgeParams.name },
          { type: "String", value: params.forgeParams.symbol },
          { type: "Integer", value: params.forgeParams.supply.toString() },
          { type: "Integer", value: params.forgeParams.decimals.toString() },
          { type: "String", value: params.forgeParams.mode },
          { type: "String", value: params.forgeParams.imageUrl ?? "" },
          { type: "Integer", value: String(params.forgeParams.creatorFeeRate ?? 0) },
        ],
      },
    ],
    signers: [{ account: fromAccount, scopes: "CalledByEntry" }],
    description: `Forge token: ${params.forgeParams.name} (${params.forgeParams.symbol})`,
  };
}
