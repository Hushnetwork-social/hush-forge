import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEVNET_ADDRESS = process.env.E2E_TEST_ACCOUNT_ADDRESS ?? "";
const NEO_RPC_TARGET = process.env.NEO_RPC_TARGET ?? "";
const DEVNET_WALLET_PASSWORD =
  process.env.E2E_TEST_ACCOUNT_PASSWORD ?? "neo";
const NEO_GO_DOCKER_IMAGE =
  process.env.NEO_GO_DOCKER_IMAGE ?? "neo3-privatenet-docker-neo-go-cli";

const CONTRACTS_DIR = path.join(process.cwd(), "public", "contracts");
const DEVNET_WALLET_PATH = path.resolve(
  process.cwd(),
  "..",
  "neo3-privatenet-docker",
  "config",
  "wallet-client1.privatenet3.json"
);

type DevnetFactoryRequest =
  | {
      action: "deploy";
      connectedAddress?: string | null;
    }
  | {
      action: "initialize";
      connectedAddress?: string | null;
      factoryHash?: string | null;
    }
  | {
      action: "bootstrapSpeculation";
      connectedAddress?: string | null;
      factoryHash?: string | null;
    };

type DevnetFactoryResponse = {
  txid: string;
  routerHash?: string;
};

type JsonRpcSuccess<T> = {
  jsonrpc: string;
  id: number;
  result: T;
};

type JsonRpcFailure = {
  jsonrpc: string;
  id: number;
  error: {
    code: number;
    message: string;
  };
};

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

type RpcStackItem = {
  type: string;
  value?: unknown;
};

type ApplicationLog = {
  executions?: Array<{
    trigger?: string;
    notifications?: Array<{
      contract: string;
      eventname: string;
      state: {
        type: string;
        value: RpcStackItem[];
      };
    }>;
  }>;
};

const CONTRACT_MANAGEMENT_HASH = "0xfffdc93764dbaddd97c48f252a53ea4643faa3fd";

function isLocalDevnetConfigured(): boolean {
  return Boolean(
    DEVNET_ADDRESS &&
      NEO_RPC_TARGET &&
      existsSync(DEVNET_WALLET_PATH) &&
      /127\.0\.0\.1|localhost/.test(NEO_RPC_TARGET)
  );
}

function ensureAuthorizedCaller(connectedAddress?: string | null): string | null {
  if (!connectedAddress) {
    return "Connect the devnet wallet before deploying the factory.";
  }

  if (connectedAddress !== DEVNET_ADDRESS) {
    return `Connected wallet ${connectedAddress} does not match the configured devnet deployer ${DEVNET_ADDRESS}.`;
  }

  return null;
}

function normalizeDockerPath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function normalizeDockerRpcTarget(target: string): string {
  try {
    const url = new URL(target);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      url.hostname = "host.docker.internal";
    }
    return url.toString();
  } catch {
    return target;
  }
}

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function normalizeHash(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function extractTxId(output: string): string {
  const match = output.match(/\b([0-9a-fA-F]{64})\b/);
  if (!match) {
    throw new Error(
      `Devnet factory action did not return a transaction hash.\n${output.trim()}`
    );
  }
  return `0x${match[1].toLowerCase()}`;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(NEO_RPC_TARGET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Neo RPC ${method} failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if ("error" in payload) {
    throw new Error(`Neo RPC error: ${payload.error.message}`);
  }

  return payload.result;
}

async function isContractDeployed(contractHash: string): Promise<boolean> {
  try {
    await rpcCall("getcontractstate", [normalizeHash(contractHash)]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unknown contract/i.test(message)) {
      return false;
    }
    throw error;
  }
}

async function waitForContract(contractHash: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isContractDeployed(contractHash)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for contract ${contractHash} to appear on-chain.`);
}

async function getApplicationLog(txid: string): Promise<ApplicationLog> {
  return rpcCall<ApplicationLog>("getapplicationlog", [txid]);
}

function extractDeployedHashFromLog(log: ApplicationLog): string | null {
  for (const execution of log.executions ?? []) {
    if (execution.trigger !== "Application") {
      continue;
    }

    for (const notification of execution.notifications ?? []) {
      if (
        notification.contract.toLowerCase() !== CONTRACT_MANAGEMENT_HASH ||
        notification.eventname !== "Deploy"
      ) {
        continue;
      }

      const firstValue = notification.state?.value?.[0];
      if (
        firstValue?.type === "ByteString" &&
        typeof firstValue.value === "string"
      ) {
        const bytes = Buffer.from(firstValue.value, "base64");
        if (bytes.length === 20) {
          return `0x${bytes.toString("hex").toLowerCase()}`;
        }
      }
    }
  }

  return null;
}

function extractHashFromAlreadyExistsError(error: Error): string | null {
  const match = error.message.match(/0x[0-9a-fA-F]{40}/);
  return match ? normalizeHash(match[0]) : null;
}

async function withWalletConfig<T>(
  runner: (walletConfigPath: string) => Promise<T>
): Promise<T> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "forge-devnet-"));
  const walletConfigPath = path.join(tempDir, "wallet.config.json");

  await writeFile(
    walletConfigPath,
    JSON.stringify({
      Path: "/wallet.json",
      Password: DEVNET_WALLET_PASSWORD,
    }),
    "utf8"
  );

  try {
    return await runner(walletConfigPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function spawnDocker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to run docker for local devnet factory action: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      const message = [stdout.trim(), stderr.trim()]
        .filter((part) => part.length > 0)
        .join("\n");

      reject(
        new Error(
          message || `docker exited with status ${code ?? "unknown"}.`
        )
      );
    });
  });
}

function buildDockerPrelude(walletConfigPath: string): string[] {
  return [
    "run",
    "--rm",
    "--entrypoint",
    "neo-go",
    "-v",
    `${normalizeDockerPath(CONTRACTS_DIR)}:/contracts`,
    "-v",
    `${normalizeDockerPath(DEVNET_WALLET_PATH)}:/wallet.json`,
    "-v",
    `${normalizeDockerPath(walletConfigPath)}:/wallet.config`,
    NEO_GO_DOCKER_IMAGE,
  ];
}

async function runDeploy(walletConfigPath: string): Promise<string> {
  const args = [
    ...buildDockerPrelude(walletConfigPath),
    "contract",
    "deploy",
    "-r",
    normalizeDockerRpcTarget(NEO_RPC_TARGET),
    "--wallet-config",
    "/wallet.config",
    "-a",
    DEVNET_ADDRESS,
    "--force",
    "--await",
    "--in",
    "/contracts/TokenFactory.nef",
    "--manifest",
    "/contracts/TokenFactory.manifest.json",
  ];

  const output = await spawnDocker(args);
  return extractTxId(output);
}

async function runDeployRouter(walletConfigPath: string): Promise<string> {
  const args = [
    ...buildDockerPrelude(walletConfigPath),
    "contract",
    "deploy",
    "-r",
    normalizeDockerRpcTarget(NEO_RPC_TARGET),
    "--wallet-config",
    "/wallet.config",
    "-a",
    DEVNET_ADDRESS,
    "--force",
    "--await",
    "--in",
    "/contracts/BondingCurveRouter.nef",
    "--manifest",
    "/contracts/BondingCurveRouter.manifest.json",
  ];

  const output = await spawnDocker(args);
  return output;
}

async function runInitialize(
  walletConfigPath: string,
  factoryHash: string
): Promise<string> {
  const manifestJson = JSON.stringify(
    JSON.parse(
      await readFile(
        path.join(CONTRACTS_DIR, "TokenTemplate.manifest.json"),
        "utf8"
      )
    )
  );

  const args = [
    ...buildDockerPrelude(walletConfigPath),
    "contract",
    "invokefunction",
    "-r",
    normalizeDockerRpcTarget(NEO_RPC_TARGET),
    "--wallet-config",
    "/wallet.config",
    "-a",
    DEVNET_ADDRESS,
    "--force",
    "--await",
    stripHexPrefix(factoryHash),
    "setNefAndManifest",
    "filebytes:/contracts/TokenTemplate.nef",
    `string:${manifestJson}`,
    "--",
    `${DEVNET_ADDRESS}:Global`,
  ];

  const output = await spawnDocker(args);
  return extractTxId(output);
}

async function runSetAuthorizedFactory(
  walletConfigPath: string,
  routerHash: string,
  factoryHash: string
): Promise<string> {
  const args = [
    ...buildDockerPrelude(walletConfigPath),
    "contract",
    "invokefunction",
    "-r",
    normalizeDockerRpcTarget(NEO_RPC_TARGET),
    "--wallet-config",
    "/wallet.config",
    "-a",
    DEVNET_ADDRESS,
    "--force",
    "--await",
    stripHexPrefix(routerHash),
    "setAuthorizedFactory",
    `hash160:${stripHexPrefix(normalizeHash(factoryHash))}`,
    "--",
    `${DEVNET_ADDRESS}:Global`,
  ];

  const output = await spawnDocker(args);
  return extractTxId(output);
}

async function runSetFactoryRouter(
  walletConfigPath: string,
  factoryHash: string,
  routerHash: string
): Promise<string> {
  const args = [
    ...buildDockerPrelude(walletConfigPath),
    "contract",
    "invokefunction",
    "-r",
    normalizeDockerRpcTarget(NEO_RPC_TARGET),
    "--wallet-config",
    "/wallet.config",
    "-a",
    DEVNET_ADDRESS,
    "--force",
    "--await",
    stripHexPrefix(factoryHash),
    "setBondingCurveRouter",
    `hash160:${stripHexPrefix(normalizeHash(routerHash))}`,
    "--",
    `${DEVNET_ADDRESS}:Global`,
  ];

  const output = await spawnDocker(args);
  return extractTxId(output);
}

async function bootstrapSpeculation(
  walletConfigPath: string,
  factoryHash: string
): Promise<DevnetFactoryResponse> {
  let routerHash = "0x";

  try {
    const deployOutput = await runDeployRouter(walletConfigPath);
    const outputHashMatch = deployOutput.match(/Contract:\s*([0-9a-fA-F]{40})/);
    if (outputHashMatch) {
      routerHash = `0x${outputHashMatch[1].toLowerCase()}`;
    } else {
      const routerTxid = extractTxId(deployOutput);
      const appLog = await getApplicationLog(routerTxid);
      const deployedHash = extractDeployedHashFromLog(appLog);
      if (!deployedHash) {
        throw new Error("Unable to determine BondingCurveRouter hash from deployment log.");
      }
      routerHash = deployedHash;
    }
    await waitForContract(routerHash);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const existingHash = extractHashFromAlreadyExistsError(error);
    if (!existingHash) {
      throw error;
    }

    routerHash = existingHash;
    await waitForContract(routerHash);
  }

  await runSetAuthorizedFactory(walletConfigPath, routerHash, factoryHash);
  const txid = await runSetFactoryRouter(walletConfigPath, factoryHash, routerHash);

  return { txid, routerHash };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isLocalDevnetConfigured()) {
    return NextResponse.json(
      { error: "Devnet factory actions are not configured." },
      { status: 503 }
    );
  }

  let body: DevnetFactoryRequest;
  try {
    body = (await request.json()) as DevnetFactoryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const callerError = ensureAuthorizedCaller(body.connectedAddress);
  if (callerError) {
    return NextResponse.json({ error: callerError }, { status: 403 });
  }

  try {
    const result = await withWalletConfig(async (walletConfigPath) => {
      if (body.action === "deploy") {
        const txid = await runDeploy(walletConfigPath);
        return { txid } satisfies DevnetFactoryResponse;
      }

      if (!body.factoryHash) {
        throw new Error("Factory hash is required for initialization.");
      }

      const normalizedFactoryHash = normalizeHash(body.factoryHash);

      if (body.action === "initialize") {
        await runInitialize(walletConfigPath, normalizedFactoryHash);
        return bootstrapSpeculation(walletConfigPath, normalizedFactoryHash);
      }

      return bootstrapSpeculation(walletConfigPath, normalizedFactoryHash);
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Devnet factory transaction failed.",
      },
      { status: 500 }
    );
  }
}
