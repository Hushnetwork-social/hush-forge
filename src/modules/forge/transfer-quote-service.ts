import { addressToHash160, invokeFunction } from "./neo-rpc-client";
import type { RpcStackItem, TransferQuote } from "./types";

function parseStackItemAsBigInt(item: RpcStackItem | undefined): bigint {
  if (!item) return 0n;

  if (item.type === "Integer") {
    try {
      return BigInt(String(item.value));
    } catch {
      return 0n;
    }
  }

  if (item.type === "ByteString") {
    try {
      const bytes = Uint8Array.from(atob(item.value as string), (c) =>
        c.charCodeAt(0)
      );
      if (bytes.length === 0) return 0n;
      let result = 0n;
      for (let i = bytes.length - 1; i >= 0; i -= 1) {
        result = (result << 8n) | BigInt(bytes[i]);
      }
      return result;
    } catch {
      return 0n;
    }
  }

  return 0n;
}

function parseStackItemAsBoolean(item: RpcStackItem | undefined): boolean {
  return parseStackItemAsBigInt(item) !== 0n;
}

function readArrayItem(items: RpcStackItem[], index: number): RpcStackItem | undefined {
  return items[index];
}

export async function quoteTokenTransfer(
  tokenHash: string,
  fromAddress: string,
  toAddress: string,
  amountRaw: bigint
): Promise<TransferQuote> {
  const result = await invokeFunction(tokenHash, "quoteTransfer", [
    { type: "Hash160", value: addressToHash160(fromAddress) },
    { type: "Hash160", value: addressToHash160(toAddress) },
    { type: "Integer", value: amountRaw.toString() },
  ]);

  const top = result.stack[0];
  if (!top || top.type !== "Array" || !Array.isArray(top.value)) {
    throw new Error("quoteTransfer returned an unexpected stack shape.");
  }

  const values = top.value as RpcStackItem[];
  if (values.length < 9) {
    throw new Error("quoteTransfer returned an incomplete breakdown.");
  }

  return {
    grossAmountRaw: parseStackItemAsBigInt(readArrayItem(values, 0)),
    recipientAmountRaw: parseStackItemAsBigInt(readArrayItem(values, 1)),
    transferBurnAmountRaw: parseStackItemAsBigInt(readArrayItem(values, 2)),
    totalTokenBurnedRaw: parseStackItemAsBigInt(readArrayItem(values, 3)),
    platformFeeDatoshi: parseStackItemAsBigInt(readArrayItem(values, 4)),
    creatorFeeDatoshi: parseStackItemAsBigInt(readArrayItem(values, 5)),
    totalGasFeeDatoshi: parseStackItemAsBigInt(readArrayItem(values, 6)),
    isMint: parseStackItemAsBoolean(readArrayItem(values, 7)),
    isDirectBurn: parseStackItemAsBoolean(readArrayItem(values, 8)),
  };
}
