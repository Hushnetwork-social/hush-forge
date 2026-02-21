/**
 * Mock dAPI Playwright Fixture
 *
 * Injects a fake window.neon (Neon Wallet compatible dAPI) into the browser
 * before each test. The mock:
 * - Returns the neo3-privatenet-docker pre-funded account for getAccount()
 * - Signs and submits real transactions to the private devnet using its WIF
 * - Supports "reject mode" per-test to simulate wallet rejection
 *
 * The signing bridge uses page.exposeFunction() to call Node.js neon-js from
 * the browser mock without exposing the private key to the browser context.
 *
 * Required env vars (set in .env.local):
 *   E2E_TEST_ACCOUNT_ADDRESS  — docker pre-funded address: NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c
 *   E2E_TEST_ACCOUNT_WIF      — docker pre-funded WIF: L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok
 *   NEXT_PUBLIC_NEO_RPC_URL   — private devnet RPC endpoint (default: http://localhost:10332)
 */

import { test as base } from "playwright-bdd";
import * as Neon from "@cityofzion/neon-js";

const NEO_RPC_URL =
  process.env.NEXT_PUBLIC_NEO_RPC_URL ?? "http://localhost:10332";
const TEST_ADDRESS = process.env.E2E_TEST_ACCOUNT_ADDRESS ?? "";
const TEST_WIF = process.env.E2E_TEST_ACCOUNT_WIF ?? "";

// ---------------------------------------------------------------------------
// Types matching NeoLine dAPI invoke() parameters
// ---------------------------------------------------------------------------

interface ContractParam {
  type: string;
  value: unknown;
}

interface InvokeArgs {
  scriptHash: string;
  operation: string;
  args?: ContractParam[];
  fee?: string;
}

interface InvokeResult {
  txid: string;
  nodeURL: string;
  signedTx?: string;
}

// ---------------------------------------------------------------------------
// Node.js signing bridge — called from browser via exposeFunction
// ---------------------------------------------------------------------------

async function signAndSubmit(invokeArgs: InvokeArgs): Promise<InvokeResult> {
  if (!TEST_WIF) {
    throw new Error(
      "E2E_TEST_ACCOUNT_WIF not set. Add it to .env.local for E2E tests."
    );
  }

  const account = new Neon.wallet.Account(TEST_WIF);
  const rpcClient = new Neon.rpc.RPCClient(NEO_RPC_URL);

  // Build script from invoke args
  const builder = new Neon.sc.ScriptBuilder();
  const args = (invokeArgs.args ?? []).map((p) => {
    switch (p.type) {
      case "Hash160":
        return Neon.sc.ContractParam.hash160(p.value as string);
      case "Integer":
        return Neon.sc.ContractParam.integer(p.value as number | string);
      case "String":
        return Neon.sc.ContractParam.string(p.value as string);
      case "Boolean":
        return Neon.sc.ContractParam.boolean(p.value as boolean);
      case "ByteArray":
        return Neon.sc.ContractParam.byteArray(p.value as string);
      case "Array":
        return Neon.sc.ContractParam.array(
          ...(p.value as ContractParam[]).map(() =>
            Neon.sc.ContractParam.any()
          )
        );
      default:
        return Neon.sc.ContractParam.any(p.value as string | null | undefined);
    }
  });

  builder.emitContractCall({
    scriptHash: invokeArgs.scriptHash,
    operation: invokeArgs.operation,
    callFlags: Neon.sc.CallFlags.All,
    args,
  });

  const script = builder.build();
  const currentHeight = await rpcClient.getBlockCount();
  const validUntilBlock = currentHeight + 5760;

  const tx = new Neon.tx.Transaction({
    script,
    validUntilBlock,
    signers: [
      {
        account: Neon.u.HexString.fromHex(
          Neon.wallet.getScriptHashFromAddress(account.address)
        ),
        scopes: Neon.tx.WitnessScope.CalledByEntry,
      },
    ],
  });

  // Add GAS fee — fetch network fee from RPC
  const networkFeeResult = await rpcClient.calculateNetworkFee(
    tx.serialize(false)
  );
  tx.networkFee = Neon.u.BigInteger.fromNumber(networkFeeResult);
  tx.systemFee = Neon.u.BigInteger.fromNumber(0);

  // Sign and send
  tx.sign(account, await rpcClient.getVersion().then((v) => v.protocol?.network ?? 5195086));

  const txid = await rpcClient.sendRawTransaction(tx.serialize(true));

  return { txid, nodeURL: NEO_RPC_URL };
}

// ---------------------------------------------------------------------------
// Playwright fixture
// ---------------------------------------------------------------------------

type MockDapiFixture = {
  /** Sets reject mode — next invoke() call will throw a wallet rejection */
  setRejectMode(reject: boolean): Promise<void>;
  /** The test account address (docker pre-funded account) */
  address: string;
};

type Fixtures = {
  mockDapi: MockDapiFixture;
};

export const test = base.extend<Fixtures>({
  mockDapi: async ({ page }, use) => {
    let rejectMode = false;

    // Expose Node.js signing function to the browser
    await page.exposeFunction(
      "__neoSignAndSubmit",
      async (invokeArgs: InvokeArgs): Promise<InvokeResult> => {
        if (rejectMode) {
          throw new Error("User rejected the transaction");
        }
        return signAndSubmit(invokeArgs);
      }
    );

    // Inject window.neo mock before the page boots
    await page.addInitScript(
      ({ address }: { address: string }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).neon = {
          NEO: { getAccount: async () => ({ address }) },
          GAS: {},

          getAccount: async (): Promise<{ address: string }> => ({ address }),

          getNetworks: async (): Promise<{ defaultNetwork: string; networks: string[] }> => ({
            defaultNetwork: "PrivateNet",
            networks: ["PrivateNet"],
          }),

          getBalance: async (): Promise<unknown> => {
            // Real balance check via RPC is handled in the app's RpcClient
            return { balance: [] };
          },

          invoke: async (args: unknown): Promise<{ txid: string }> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).__neoSignAndSubmit(args);
            return result;
          },

          pickAddress: async (): Promise<{ address: string }> => ({ address }),

          addNEP17: async (): Promise<void> => {
            // No-op — observable via test assertions if needed
          },

          send: async (): Promise<void> => {
            throw new Error("send() not implemented in mock dAPI");
          },
        };
      },
      { address: TEST_ADDRESS }
    );

    const fixture: MockDapiFixture = {
      setRejectMode: async (reject: boolean) => {
        rejectMode = reject;
      },
      address: TEST_ADDRESS,
    };

    await use(fixture);
  },
});

export { expect } from "@playwright/test";
