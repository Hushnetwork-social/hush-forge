"use client";

type UnknownRecord = Record<string, unknown>;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNested(obj: UnknownRecord, key: string): string | null {
  const direct = readString(obj[key]);
  if (direct) return direct;
  const nested = obj[key];
  if (nested && typeof nested === "object") {
    const rec = nested as UnknownRecord;
    return readString(rec.message) ?? readString(rec.description);
  }
  return null;
}

export function toUiErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "WalletRejectedError") return "Transaction cancelled.";
    const msg = readString(err.message);
    if (msg && msg !== "[object Object]") return msg;
  }

  if (err && typeof err === "object") {
    const obj = err as UnknownRecord;
    const type = readString(obj.type)?.toUpperCase();
    const message =
      readNested(obj, "description") ??
      readNested(obj, "message") ??
      readNested(obj, "error") ??
      readNested(obj, "data");

    if (message) {
      if (type === "RPC_ERROR" && message.toLowerCase() === "rpc error") {
        return "Transaction failed on-chain. Open NeoLine details for the exact reason.";
      }
      return message;
    }
  }

  const fallback = readString(String(err));
  if (fallback && fallback !== "[object Object]") return fallback;
  return "Unexpected transaction error. Check wallet details.";
}

