/**
 * Mock dAPI Playwright Fixture
 *
 * Injects a fake window.neon (Neon Wallet compatible dAPI) into the browser
 * before each test. The mock:
 * - returns the neo3-privatenet-docker pre-funded account for getAccount()
 * - signs and submits real transactions through the FEAT-122 wallet harness
 * - supports reject mode per test to simulate wallet rejection
 *
 * The signing bridge uses page.exposeFunction() to call Node.js code from the
 * browser mock without exposing the private key to the browser context.
 */

import { test as base } from "playwright-bdd";
import {
  loadForgeWalletHarnessConfig,
  signAndSubmitNeoInvocation,
  type NeoInvocationRequest,
} from "@hushnetwork/forge-wallet-harness";

const harnessConfig = loadForgeWalletHarnessConfig({
  ...process.env,
  FORGE_WALLET_HARNESS_RPC_URL:
    process.env.FORGE_WALLET_HARNESS_RPC_URL ??
    process.env.E2E_NEO_RPC_URL ??
    "http://localhost:10332",
  FORGE_WALLET_HARNESS_WIF:
    process.env.FORGE_WALLET_HARNESS_WIF ?? process.env.E2E_TEST_ACCOUNT_WIF,
});

interface InvokeResult {
  txid: string;
  nodeURL: string;
  signedTx?: string;
}

async function signAndSubmit(
  invokeArgs: NeoInvocationRequest
): Promise<InvokeResult> {
  const result = await signAndSubmitNeoInvocation({
    config: harnessConfig,
    request: invokeArgs,
  });

  return {
    nodeURL: result.nodeURL,
    signedTx: result.signedTx,
    txid: result.txid,
  };
}

type MockDapiFixture = {
  /** Sets reject mode; the next invoke() call throws a wallet rejection. */
  setRejectMode(reject: boolean): Promise<void>;
  /** The test account address from the wallet harness config. */
  address: string;
};

type Fixtures = {
  mockDapi: MockDapiFixture;
};

export const test = base.extend<Fixtures>({
  mockDapi: async ({ page }, use) => {
    let rejectMode = false;

    await page.exposeFunction(
      "__neoSignAndSubmit",
      async (invokeArgs: NeoInvocationRequest): Promise<InvokeResult> => {
        if (rejectMode) {
          throw new Error("User rejected the transaction");
        }

        return signAndSubmit(invokeArgs);
      }
    );

    await page.addInitScript(
      ({ address }: { address: string }) => {
        const api = {
          NEO: { getAccount: async () => ({ address }) },
          GAS: {},

          getAccount: async (): Promise<{ address: string }> => ({ address }),

          getNetworks: async (): Promise<{
            defaultNetwork: string;
            networks: string[];
          }> => ({
            defaultNetwork: "PrivateNet",
            networks: ["PrivateNet"],
          }),

          getBalance: async (): Promise<unknown> => {
            return { balance: [] };
          },

          invoke: async (args: unknown): Promise<{ txid: string }> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as any).__neoSignAndSubmit(args);
          },

          pickAddress: async (): Promise<{ address: string }> => ({ address }),

          AddNEP17: async (): Promise<void> => {},
          addNEP17: async (): Promise<void> => {},

          send: async (): Promise<void> => {
            throw new Error("send() not implemented in mock dAPI");
          },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).neon = api;
      },
      { address: harnessConfig.account.address }
    );

    const fixture: MockDapiFixture = {
      setRejectMode: async (reject: boolean) => {
        rejectMode = reject;
      },
      address: harnessConfig.account.address,
    };

    await use(fixture);
  },
});

export { expect } from "@playwright/test";
