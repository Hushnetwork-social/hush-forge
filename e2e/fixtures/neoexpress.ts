/**
 * Playwright Global Setup — NeoExpress Devnet Health Check
 *
 * Runs before all E2E tests. Verifies:
 * 1. NeoExpress RPC is reachable (getblockcount)
 * 2. TokenFactory contract is deployed (getTokenCount)
 *
 * If either check fails → throws with clear instructions, aborting all tests.
 */

import type { FullConfig } from "@playwright/test";

const NEO_RPC_URL =
  process.env.NEXT_PUBLIC_NEO_RPC_URL ?? "http://localhost:10332";
const FACTORY_HASH =
  process.env.NEXT_PUBLIC_FACTORY_CONTRACT_HASH ?? "";

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(
  method: string,
  params: unknown[] = []
): Promise<T> {
  const resp = await fetch(NEO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${NEO_RPC_URL}`);
  }
  const data: RpcResponse<T> = await resp.json();
  if (data.error) {
    throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
  }
  return data.result as T;
}

async function globalSetup(_config: FullConfig): Promise<void> {
  // 1. Verify NeoExpress is reachable
  try {
    const blockCount = await rpcCall<number>("getblockcount");
    if (!blockCount || blockCount < 1) {
      throw new Error(`Invalid block count: ${blockCount}`);
    }
    console.log(`✓ NeoExpress: OK (block ${blockCount} at ${NEO_RPC_URL})`);
  } catch (err) {
    throw new Error(
      `\n\nNeoExpress devnet not reachable at ${NEO_RPC_URL}.\n` +
        `Start it with:\n` +
        `  neoxp run --input hush-neo-contracts/devnet/devnet.neo-express --discard\n\n` +
        `Error: ${err}\n`
    );
  }

  // 2. Verify TokenFactory contract is deployed
  if (FACTORY_HASH) {
    try {
      const result = await rpcCall<{ state: string }>("invokefunction", [
        FACTORY_HASH,
        "getTokenCount",
        [],
      ]);
      if (result.state === "FAULT") {
        throw new Error("Contract invocation returned FAULT state");
      }
      console.log(`✓ TokenFactory contract: OK (${FACTORY_HASH})`);
    } catch (err) {
      throw new Error(
        `\n\nTokenFactory contract not deployed or not responding at ${FACTORY_HASH}.\n` +
          `Deploy it first:\n` +
          `  neoxp batch hush-neo-contracts/devnet/deploy-factory.batch.neo-express\n\n` +
          `Error: ${err}\n`
      );
    }
  } else {
    console.warn(
      "⚠  NEXT_PUBLIC_FACTORY_CONTRACT_HASH not set — skipping factory contract check"
    );
  }
}

export default globalSetup;
