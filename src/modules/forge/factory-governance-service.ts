import { getNep17Balances, invokeFunction } from "./neo-rpc-client";
import { resolveTokenMetadata } from "./token-metadata-service";
import type {
  ClaimableFactoryAsset,
  ClaimableFactoryGasSummary,
  FactoryConfig,
  InvokeResult,
  RpcStackItem,
} from "./types";

const GAS_CONTRACT_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";

function expectStackItem(values: RpcStackItem[], index: number): RpcStackItem {
  const item = values[index];
  if (!item) throw new Error(`Missing stack item at index ${index}`);
  return item;
}

function decodeHash(stackItem: RpcStackItem): string {
  if (stackItem.type !== "ByteString" && stackItem.type !== "ByteArray") {
    throw new Error(`Expected hash ByteString, got ${stackItem.type}`);
  }
  const bytes = Uint8Array.from(atob(String(stackItem.value)), (c) => c.charCodeAt(0));
  if (bytes.length !== 20) throw new Error(`Expected 20-byte hash, got ${bytes.length}`);
  const hex = [...bytes]
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

function parseInteger(stackItem: RpcStackItem): bigint {
  if (stackItem.type !== "Integer") {
    throw new Error(`Expected Integer, got ${stackItem.type}`);
  }
  return BigInt(String(stackItem.value));
}

function parseBoolean(stackItem: RpcStackItem): boolean {
  if (stackItem.type !== "Boolean") {
    throw new Error(`Expected Boolean, got ${stackItem.type}`);
  }
  return Boolean(stackItem.value);
}

export function parseFactoryConfig(result: InvokeResult): FactoryConfig {
  const top = result.stack[0];
  if (!top || top.type !== "Array") {
    throw new Error("Factory GetConfig() did not return an Array");
  }

  const values = top.value as RpcStackItem[];
  if (values.length !== 8) {
    throw new Error(`Factory GetConfig() returned ${values.length} fields, expected 8`);
  }

  return {
    creationFee: parseInteger(expectStackItem(values, 0)),
    operationFee: parseInteger(expectStackItem(values, 1)),
    paused: parseBoolean(expectStackItem(values, 2)),
    owner: decodeHash(expectStackItem(values, 3)),
    templateScriptHash: decodeHash(expectStackItem(values, 4)),
    templateVersion: parseInteger(expectStackItem(values, 5)),
    templateNefStored: parseBoolean(expectStackItem(values, 6)),
    templateManifestStored: parseBoolean(expectStackItem(values, 7)),
  };
}

export async function fetchFactoryConfig(factoryHash: string): Promise<FactoryConfig> {
  const result = await invokeFunction(factoryHash, "getConfig", []);
  return parseFactoryConfig(result);
}

function formatDisplayAmount(amount: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  const whole = amount / factor;
  const fraction = amount % factor;
  return `${whole.toLocaleString("en-US")}.${fraction.toString().padStart(decimals, "0")}`;
}

export async function fetchClaimableFactoryAssets(
  factoryAddress: string
): Promise<ClaimableFactoryAsset[]> {
  const result = await getNep17Balances(factoryAddress);
  const nonZeroBalances = result.balance.filter((entry) => BigInt(entry.amount) > 0n);

  const assets = await Promise.all(
    nonZeroBalances.map(async (entry) => {
      const contractHash = entry.assethash.startsWith("0x")
        ? entry.assethash
        : `0x${entry.assethash}`;
      const amount = BigInt(entry.amount);

      try {
        const metadata = await resolveTokenMetadata(contractHash);
        return {
          contractHash,
          symbol: metadata.symbol || "Unknown Asset",
          name: metadata.name || "Unknown Asset",
          amount,
          decimals: Number.isFinite(metadata.decimals) ? metadata.decimals : null,
          displayAmount: formatDisplayAmount(amount, metadata.decimals),
          partialClaimSupported: Number.isFinite(metadata.decimals),
        } satisfies ClaimableFactoryAsset;
      } catch {
        return {
          contractHash,
          symbol: "Unknown Asset",
          name: "Unknown Asset",
          amount,
          decimals: null,
          displayAmount: amount.toString(),
          partialClaimSupported: false,
        } satisfies ClaimableFactoryAsset;
      }
    })
  );

  return assets;
}

export function getClaimableFactoryGasAsset(
  assets: ClaimableFactoryAsset[]
): ClaimableFactoryAsset | null {
  return (
    assets.find(
      (asset) => asset.contractHash.toLowerCase() === GAS_CONTRACT_HASH
    ) ?? null
  );
}

export function getClaimableFactoryGasSummary(
  assets: ClaimableFactoryAsset[]
): ClaimableFactoryGasSummary {
  const asset = getClaimableFactoryGasAsset(assets);
  if (asset === null) {
    return {
      asset: null,
      amount: 0n,
      displayAmount: "0 GAS",
      available: false,
    };
  }

  return {
    asset,
    amount: asset.amount,
    displayAmount: `${asset.displayAmount} GAS`,
    available: true,
  };
}
