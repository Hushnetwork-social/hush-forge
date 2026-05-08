import { expect, test } from "@playwright/test";
import { execSync } from "child_process";
import * as path from "path";
import {
  assertNeoNetworkMagic,
  loadForgeWalletHarnessConfig,
  signAndSubmitNeoInvocation,
  type NeoInvocationRequest,
} from "../../tools/forge-wallet-harness";

const DOCKER_COMPOSE_DIR = path.resolve(
  __dirname,
  "../../../neo3-privatenet-docker"
);
const FORGE_ROOT_DIR = path.resolve(__dirname, "../..");
const NEO_RPC_URL = "http://localhost:10332";
const FACTORY_HASH_STORAGE_KEY = "forge_factory_hash";
const WALLET_STORAGE_KEY = "forge_wallet_type";

const harnessConfig = loadForgeWalletHarnessConfig({
  ...process.env,
  FORGE_WALLET_HARNESS_RPC_URL:
    process.env.FORGE_WALLET_HARNESS_RPC_URL ?? NEO_RPC_URL,
});

test.describe("FEAT-122 FORGE wallet harness integration", () => {
  test.beforeEach(async ({ page }) => {
    resetChain();
    await waitForChain();
    await waitForFunding(harnessConfig.account.address);
    await assertNeoNetworkMagic({
      expectedMagic: harnessConfig.expectedMagic,
      rpcUrl: harnessConfig.rpcUrl,
    });

    const factoryHash = deployFactoryAndParseHash();
    await installHarnessWallet(page, factoryHash);
  });

  test("Forge creation signs and broadcasts through the wallet harness", async ({
    page,
  }) => {
    await page.goto("/tokens");
    await ensureWalletConnected(page);

    await page.getByRole("button", { name: "Forge Token" }).click();

    const overlay = page.getByRole("dialog", { name: "Forge a Token" });
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    await overlay.getByLabel("Token Name").fill("Harness Wallet Token");
    await overlay.getByLabel(/^Symbol/).fill("HWCT");
    await overlay.getByLabel("Total Supply").fill("1000000");
    await overlay.getByLabel(/^Decimals/).fill("8");

    await expect(overlay.getByRole("button", { name: /FORGE/ })).toBeEnabled({
      timeout: 30_000,
    });

    await overlay.getByRole("button", { name: /FORGE/ }).click();

    const createdTokenCard = page
      .getByRole("article")
      .filter({ hasText: "HWCT" })
      .first();
    await expect(createdTokenCard).toBeVisible({ timeout: 120_000 });
    await expect(createdTokenCard).toContainText("Yours");
  });
});

async function installHarnessWallet(
  page: import("@playwright/test").Page,
  factoryHash: string
): Promise<void> {
  await page.exposeFunction(
    "__forgeHarnessSignAndSubmit",
    async (request: NeoInvocationRequest) => {
      return signAndSubmitNeoInvocation({
        config: harnessConfig,
        request,
      });
    }
  );

  await page.addInitScript(
    ({
      address,
      factoryHash,
      factoryHashStorageKey,
      walletStorageKey,
    }: {
      address: string;
      factoryHash: string;
      factoryHashStorageKey: string;
      walletStorageKey: string;
    }) => {
      window.localStorage.setItem(factoryHashStorageKey, factoryHash);
      window.localStorage.setItem(walletStorageKey, "Neon");

      const api = {
        NEO: { getAccount: async () => ({ address }) },
        GAS: {},
        AddNEP17: async (): Promise<void> => {},
        addNEP17: async (): Promise<void> => {},
        getAccount: async (): Promise<{ address: string }> => ({ address }),
        getBalance: async (): Promise<unknown> => ({ balance: [] }),
        getNetworks: async (): Promise<{
          defaultNetwork: string;
          networks: string[];
        }> => ({
          defaultNetwork: "PrivateNet",
          networks: ["PrivateNet"],
        }),
        invoke: async (args: unknown): Promise<{ txid: string }> => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (window as any).__forgeHarnessSignAndSubmit(args);
        },
        pickAddress: async (): Promise<{ address: string }> => ({ address }),
        send: async (): Promise<void> => {
          throw new Error("send() not implemented in wallet harness");
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).neon = api;
    },
    {
      address: harnessConfig.account.address,
      factoryHash,
      factoryHashStorageKey: FACTORY_HASH_STORAGE_KEY,
      walletStorageKey: WALLET_STORAGE_KEY,
    }
  );
}

async function ensureWalletConnected(
  page: import("@playwright/test").Page
): Promise<void> {
  const prefix = harnessConfig.account.address.slice(0, 6);

  if (await hasVisibleAddressPrefix(page, prefix)) {
    return;
  }

  await page.getByRole("button", { name: /Connect Wallet/i }).first().click();
  await page.getByRole("button", { name: /Neon Wallet/i }).first().click();

  await expect(page.getByText(new RegExp(prefix))).toBeVisible({
    timeout: 20_000,
  });
}

async function hasVisibleAddressPrefix(
  page: import("@playwright/test").Page,
  prefix: string
): Promise<boolean> {
  return page
    .waitForFunction(
      (addressPrefix: string) =>
        document.body.textContent?.includes(addressPrefix) ?? false,
      prefix,
      { timeout: 5_000 }
    )
    .then(() => true)
    .catch(() => false);
}

function resetChain(): void {
  execSync("docker compose down --volumes --remove-orphans", {
    cwd: DOCKER_COMPOSE_DIR,
    stdio: "inherit",
  });
  execSync("docker compose up --detach", {
    cwd: DOCKER_COMPOSE_DIR,
    stdio: "inherit",
  });
}

async function waitForChain(timeoutMs = 90_000, pollMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await rpcCall("getblockcount", []);
      if (typeof result === "number" && result >= 1) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Chain RPC not ready after ${timeoutMs}ms`);
}

async function waitForFunding(
  address: string,
  timeoutMs = 120_000,
  pollMs = 3_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = (await rpcCall("getnep17balances", [address])) as {
        balance?: unknown[];
      };
      if ((result.balance ?? []).length >= 2) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Account ${address} not funded after ${timeoutMs}ms`);
}

function deployFactoryAndParseHash(): string {
  const output = execSync("node scripts/deploy-factory.cjs", {
    cwd: FORGE_ROOT_DIR,
    encoding: "utf8",
  });
  const match = output.match(
    /NEXT_PUBLIC_FACTORY_CONTRACT_HASH=(0x[0-9a-fA-F]{40})/
  );
  if (!match) {
    throw new Error(`Could not parse factory hash from deploy output:\n${output}`);
  }
  return match[1].toLowerCase();
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(NEO_RPC_URL, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    result?: unknown;
  };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}
