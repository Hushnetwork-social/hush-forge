import {
  getRuntimeBondingCurveRouterHash,
  getRuntimeFactoryHash,
  saveBondingCurveRouterHash,
} from "./forge-config";
import { invokeFunction, isContractDeployed } from "./neo-rpc-client";

function decodeHashStackItem(value: unknown): string {
  const base64 = String(value ?? "");
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (bytes.length !== 20) {
    throw new Error(`Expected 20-byte hash, got ${bytes.length}`);
  }

  const hex = [...bytes]
    .reverse()
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `0x${hex}`;
}

export async function resolveBondingCurveRouterHash(): Promise<string> {
  const savedRouterHash = getRuntimeBondingCurveRouterHash();
  if (savedRouterHash && savedRouterHash !== "0x") {
    const deployed = await isContractDeployed(savedRouterHash).catch(() => false);
    if (deployed) {
      return savedRouterHash;
    }
  }

  const factoryHash = getRuntimeFactoryHash();
  if (!factoryHash || factoryHash === "0x") {
    return "";
  }

  try {
    const result = await invokeFunction(factoryHash, "getBondingCurveRouter", []);
    const routerStackItem = result.stack[0];
    if (
      routerStackItem &&
      (routerStackItem.type === "ByteString" || routerStackItem.type === "ByteArray")
    ) {
      const resolvedRouterHash = decodeHashStackItem(routerStackItem.value);
      if (resolvedRouterHash !== "0x0000000000000000000000000000000000000000") {
        saveBondingCurveRouterHash(resolvedRouterHash);
        return resolvedRouterHash;
      }
    }
  } catch (error) {
    console.warn("[markets] could not resolve router hash from factory:", String(error));
  }

  return "";
}
