/**
 * Playwright Global Setup — neo3-privatenet-docker Health Check
 *
 * Runs before all E2E tests. Responsibilities:
 * 1. Optionally reset the docker chain (E2E_RESET_CHAIN=true)
 * 2. Verify the RPC node is reachable (getblockcount)
 * 3. Optionally auto-deploy the TokenFactory (E2E_AUTO_DEPLOY=true or hash missing)
 * 4. Write the factory hash to .env.local so the webServer picks it up
 *
 * Environment variables (set in .env.local or .env.e2e):
 *   NEXT_PUBLIC_NEO_RPC_URL            — defaults to http://localhost:10332
 *   NEXT_PUBLIC_FACTORY_CONTRACT_HASH  — factory hash; auto-deployed if absent
 *   E2E_RESET_CHAIN                    — set "true" to docker compose down -v + up -d
 *   E2E_AUTO_DEPLOY                    — set "true" to auto-deploy factory if hash absent
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { FullConfig } from "@playwright/test";

const NEO_RPC_URL =
  process.env.NEXT_PUBLIC_NEO_RPC_URL ?? "http://localhost:10332";
const DOCKER_DIR = path.resolve(
  __dirname,
  "../../../neo3-privatenet-docker"
);
const ENV_LOCAL = path.resolve(__dirname, "../../.env.local");

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const resp = await fetch(NEO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${NEO_RPC_URL}`);
  const data: RpcResponse<T> = await resp.json();
  if (data.error)
    throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
  return data.result as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** docker compose down -v && docker compose up -d — fresh genesis */
function resetDockerChain(): void {
  console.log("🔄  Resetting neo3-privatenet-docker chain...");
  spawnSync("docker", ["compose", "down", "-v"], {
    cwd: DOCKER_DIR,
    stdio: "inherit",
  });
  spawnSync("docker", ["compose", "up", "-d"], {
    cwd: DOCKER_DIR,
    stdio: "inherit",
  });
  console.log("✓  Docker chain reset — waiting for node to be ready...");
}

/** Wait for the RPC node to produce at least one block (up to 60 s). */
async function waitForNode(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const count = await rpcCall<number>("getblockcount");
      if (count >= 1) return;
    } catch {
      // not ready yet
    }
    await sleep(2_000);
  }
  throw new Error(
    `Neo node at ${NEO_RPC_URL} did not become ready within 60 s.`
  );
}

/**
 * Run deploy-factory.cjs, parse the factory hash from stdout, and write it
 * to .env.local so the webServer picks it up.
 */
function deployFactory(): string {
  const scriptPath = path.resolve(__dirname, "../../scripts/deploy-factory.cjs");
  console.log("🚀  Deploying TokenFactory...");
  const result = spawnSync("node", [scriptPath], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  console.log(output);
  if (result.status !== 0) {
    throw new Error(`deploy-factory.cjs exited with code ${result.status}`);
  }
  // Parse: "NEXT_PUBLIC_FACTORY_CONTRACT_HASH=0x..."
  const m = /NEXT_PUBLIC_FACTORY_CONTRACT_HASH=(0x[0-9a-fA-F]{40})/m.exec(output);
  if (!m) throw new Error("Could not parse factory hash from deploy script output");
  return m[1];
}

/** Update (or create) .env.local with the given key=value pair. */
function writeEnvLocal(key: string, value: string): void {
  let content = fs.existsSync(ENV_LOCAL)
    ? fs.readFileSync(ENV_LOCAL, "utf8")
    : "";
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_LOCAL, content);
  console.log(`✓  Wrote ${key}=${value} to .env.local`);
}

// ---------------------------------------------------------------------------

async function globalSetup(_config: FullConfig): Promise<void> {
  // ── 1. Optional chain reset ─────────────────────────────────────────────
  if (process.env.E2E_RESET_CHAIN === "true") {
    resetDockerChain();
  }

  // ── 2. Verify RPC is reachable ──────────────────────────────────────────
  try {
    await waitForNode();
    const blockCount = await rpcCall<number>("getblockcount");
    console.log(`✓  Neo Devnet: OK (block ${blockCount} at ${NEO_RPC_URL})`);
  } catch (err) {
    throw new Error(
      `\n\nnео3-privatenet-docker not reachable at ${NEO_RPC_URL}.\n` +
        `Start it with:\n` +
        `  cd neo3-privatenet-docker && docker compose up -d\n\n` +
        `Or set E2E_RESET_CHAIN=true to auto-reset before tests.\n\n` +
        `Error: ${err}\n`
    );
  }

  // ── 3. Auto-deploy factory if needed ────────────────────────────────────
  let factoryHash = process.env.NEXT_PUBLIC_FACTORY_CONTRACT_HASH ?? "";
  const needsDeploy =
    !factoryHash || process.env.E2E_AUTO_DEPLOY === "true";

  if (needsDeploy) {
    factoryHash = deployFactory();
    writeEnvLocal("NEXT_PUBLIC_FACTORY_CONTRACT_HASH", factoryHash);
    // Make the hash available to the current process (for the webServer env)
    process.env.NEXT_PUBLIC_FACTORY_CONTRACT_HASH = factoryHash;
  } else {
    // Verify the factory is deployed AND initialized (setNefAndManifest called)
    try {
      const isInit = await rpcCall<{ state: string; stack: { value: unknown }[] }>(
        "invokefunction",
        [factoryHash, "isInitialized", [], []]
      );
      if (isInit.state === "FAULT") {
        throw new Error("Contract returned FAULT on isInitialized");
      }
      const initialized = isInit.stack?.[0]?.value === true || isInit.stack?.[0]?.value === "1";
      if (!initialized) {
        throw new Error(
          "Factory is deployed but NOT initialized — run setNefAndManifest.\n" +
          "Re-run: node scripts/deploy-factory.cjs (it handles both steps)"
        );
      }
      console.log(`✓  TokenFactory contract: deployed + initialized (${factoryHash})`);
    } catch (err) {
      throw new Error(
        `\n\nTokenFactory contract not responding at ${factoryHash}.\n` +
          `Deploy it:\n` +
          `  node scripts/deploy-factory.cjs\n\n` +
          `Or set E2E_AUTO_DEPLOY=true to deploy automatically.\n\n` +
          `Error: ${err}\n`
      );
    }
  }

  // ── 4. Verify test account credentials ──────────────────────────────────
  const testAddress = process.env.E2E_TEST_ACCOUNT_ADDRESS ?? "";
  const testWif = process.env.E2E_TEST_ACCOUNT_WIF ?? "";
  if (!testAddress || !testWif) {
    console.warn(
      "⚠  E2E_TEST_ACCOUNT_ADDRESS / E2E_TEST_ACCOUNT_WIF not set.\n" +
        "   Add the docker pre-funded account to .env.local:\n" +
        "   E2E_TEST_ACCOUNT_ADDRESS=NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c\n" +
        "   E2E_TEST_ACCOUNT_WIF=L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok"
    );
  }
}

export default globalSetup;
