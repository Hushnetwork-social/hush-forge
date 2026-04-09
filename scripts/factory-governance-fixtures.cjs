/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { wallet, sc, tx, u, rpc: rpcModule } = require("@cityofzion/neon-js");
const fs = require("fs");
const path = require("path");

const RPC_URL = process.env.NEXT_PUBLIC_NEO_RPC_URL || "http://localhost:10332";
const NETWORK_MAGIC = 5195086;
const DEFAULT_TEST_WIF =
  "L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok";
const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";
const CONTRACT_MANAGEMENT_HASH = "0xfffdc93764dbaddd97c48f252a53ea4643faa3fd";
const ROUTER_NEF_PATH = path.resolve(
  __dirname,
  "../../hush-neo-contracts/src/BondingCurveRouter/bin/sc/BondingCurveRouter.nef"
);
const ROUTER_MANIFEST_PATH = path.resolve(
  __dirname,
  "../../hush-neo-contracts/src/BondingCurveRouter/bin/sc/BondingCurveRouter.manifest.json"
);

function getAccountFromEnv() {
  return new wallet.Account(process.env.E2E_TEST_ACCOUNT_WIF || DEFAULT_TEST_WIF);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHashOrAddress(value) {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  return new wallet.Account(value).scriptHash;
}

function toRpcHash160Param(value) {
  return {
    type: "Hash160",
    value: normalizeHashOrAddress(value),
  };
}

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function waitForTx(txid, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const log = await rpcCall("getapplicationlog", [txid]);
      const execution = log.executions.find((item) => item.trigger === "Application");
      if (execution) {
        if (execution.vmstate === "FAULT") {
          throw new Error(execution.exception ?? "Transaction faulted");
        }
        return log;
      }
    } catch (err) {
      if (String(err).toLowerCase().includes("fault")) throw err;
    }
    await sleep(3000);
  }
  throw new Error(`Transaction ${txid} not confirmed after ${timeoutMs / 1000}s`);
}

function resolveWitnessScope(scope) {
  if (scope === "Global") return tx.WitnessScope.Global;
  return tx.WitnessScope.CalledByEntry;
}

async function sendInvocation(account, scriptHex, scope = "CalledByEntry") {
  const client = new rpcModule.NeoServerRpcClient(RPC_URL);
  const signerSpec = [{ account: account.scriptHash, scopes: scope }];
  const dryRun = await client.invokeScript(u.HexString.fromHex(scriptHex), signerSpec);
  if (dryRun.state === "FAULT") {
    throw new Error(`Dry-run faulted: ${dryRun.exception ?? "unknown"}`);
  }

  const blockCount = await client.getBlockCount();
  const txn = new tx.Transaction({
    signers: [{ account: account.scriptHash, scopes: resolveWitnessScope(scope) }],
    script: u.HexString.fromHex(scriptHex),
    validUntilBlock: blockCount + 200,
    systemFee: u.BigInteger.fromDecimal(dryRun.gasconsumed, 0),
    networkFee: u.BigInteger.fromNumber(0),
  });

  const verificationScript = wallet.getVerificationScriptFromPublicKey(account.publicKey);
  txn.addWitness(new tx.Witness({ invocationScript: "", verificationScript }));
  const networkFee = await client.calculateNetworkFee(txn);
  txn.networkFee = u.BigInteger.fromDecimal(networkFee, 0);
  txn.sign(account, NETWORK_MAGIC);
  return client.sendRawTransaction(txn);
}

async function invokeRead(scriptHash, operation, args = []) {
  return rpcCall("invokefunction", [scriptHash, operation, args, []]);
}

function decodeHashStackItem(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.value === "string") {
    if (/^0x[0-9a-fA-F]{40}$/.test(item.value)) return item.value.toLowerCase();
    if (/^[0-9a-fA-F]{40}$/.test(item.value)) return `0x${item.value.toLowerCase()}`;

    try {
      const bytes = Buffer.from(item.value, "base64");
      if (bytes.length === 20) {
        return `0x${Buffer.from(bytes).reverse().toString("hex")}`;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function extractDeployedHash(log) {
  const managementHash = normalizeHashOrAddress(CONTRACT_MANAGEMENT_HASH);
  for (const execution of log.executions ?? []) {
    if (execution.trigger !== "Application") continue;
    for (const notification of execution.notifications ?? []) {
      if (normalizeHashOrAddress(notification.contract) !== managementHash) continue;
      if (notification.eventname !== "Deploy") continue;
      const values = Array.isArray(notification.state?.value)
        ? notification.state.value
        : [];
      const deployedHash = decodeHashStackItem(values[0]);
      if (deployedHash) return deployedHash;
    }
  }
  return null;
}

function extractTokenCreatedHash(log, factoryHash) {
  const targetHash = normalizeHashOrAddress(factoryHash);
  for (const execution of log.executions ?? []) {
    if (execution.trigger !== "Application") continue;
    for (const notification of execution.notifications ?? []) {
      if (normalizeHashOrAddress(notification.contract) !== targetHash) continue;
      if (notification.eventname !== "TokenCreated") continue;
      const values = Array.isArray(notification.state?.value)
        ? notification.state.value
        : [];
      const tokenHash = decodeHashStackItem(values[0]);
      if (tokenHash) return tokenHash;
    }
  }
  return null;
}

function decodeLittleEndianBigInt(base64Value) {
  const bytes = Buffer.from(base64Value, "base64");
  if (bytes.length === 0) return 0n;

  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) + BigInt(bytes[index]);
  }
  return result;
}

function readIntegerStack(result) {
  const value = result?.stack?.[0]?.value;
  if (typeof value === "string" && value.length > 0) {
    if (/^-?\d+$/.test(value)) return BigInt(value);
    return decodeLittleEndianBigInt(value);
  }
  if (typeof value === "number") return BigInt(value);
  return 0n;
}

async function getCurrentCreationFee(factoryHash) {
  const result = await invokeRead(factoryHash, "getMinFee");
  return readIntegerStack(result);
}

async function getLatestCreatorToken(factoryHash, creatorAddress) {
  const result = await invokeRead(factoryHash, "getTokensByCreator", [
    toRpcHash160Param(creatorAddress),
    { type: "Integer", value: "0" },
    { type: "Integer", value: "50" },
  ]);
  const values = Array.isArray(result?.stack?.[0]?.value)
    ? result.stack[0].value
    : [];
  const latest = values[values.length - 1];
  return decodeHashStackItem(latest);
}

async function setOwner(factoryHash, newOwner) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: factoryHash,
    operation: "setOwner",
    args: [sc.ContractParam.hash160(normalizeHashOrAddress(newOwner))],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`SET_OWNER_TX=${txid}`);
}

async function deployRouter(factoryHash) {
  const account = getAccountFromEnv();
  if (!fs.existsSync(ROUTER_NEF_PATH) || !fs.existsSync(ROUTER_MANIFEST_PATH)) {
    throw new Error(
      "BondingCurveRouter artifacts are missing. Build hush-neo-contracts first."
    );
  }

  const routerNef = fs.readFileSync(ROUTER_NEF_PATH);
  const routerManifest = fs.readFileSync(ROUTER_MANIFEST_PATH, "utf8");
  const deployScript = sc.createScript({
    scriptHash: CONTRACT_MANAGEMENT_HASH,
    operation: "deploy",
    args: [
      sc.ContractParam.byteArray(routerNef.toString("base64")),
      sc.ContractParam.string(routerManifest),
      sc.ContractParam.array(
        sc.ContractParam.hash160(normalizeHashOrAddress(account.address)),
        sc.ContractParam.hash160(factoryHash)
      ),
    ],
  });

  const deployTxid = await sendInvocation(account, deployScript);
  const deployLog = await waitForTx(deployTxid);
  const routerHash = extractDeployedHash(deployLog);
  if (!routerHash) {
    throw new Error("Could not determine BondingCurveRouter hash after deployment");
  }

  const setRouterScript = sc.createScript({
    scriptHash: factoryHash,
    operation: "setBondingCurveRouter",
    args: [sc.ContractParam.hash160(routerHash)],
  });
  const setRouterTxid = await sendInvocation(account, setRouterScript);
  await waitForTx(setRouterTxid);

  console.log(`DEPLOY_ROUTER_TX=${deployTxid}`);
  console.log(`SET_ROUTER_TX=${setRouterTxid}`);
  console.log(`ROUTER_HASH=${routerHash}`);
}

async function fundFactory(factoryHash, amount) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: GAS_HASH,
    operation: "transfer",
    args: [
      sc.ContractParam.hash160(account.scriptHash),
      sc.ContractParam.hash160(factoryHash),
      sc.ContractParam.integer(String(amount)),
      sc.ContractParam.any(null),
    ],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`FUND_FACTORY_TX=${txid}`);
}

async function createToken(factoryHash, name, symbol, supply, decimals, creatorFeeRate) {
  const account = getAccountFromEnv();
  const creationFee = await getCurrentCreationFee(factoryHash);
  const tokenData = sc.ContractParam.array(
    sc.ContractParam.string(name),
    sc.ContractParam.string(symbol),
    sc.ContractParam.integer(String(supply)),
    sc.ContractParam.integer(String(decimals)),
    sc.ContractParam.string("community"),
    sc.ContractParam.string(""),
    sc.ContractParam.integer(String(creatorFeeRate))
  );

  const script = sc.createScript({
    scriptHash: GAS_HASH,
    operation: "transfer",
    args: [
      sc.ContractParam.hash160(account.scriptHash),
      sc.ContractParam.hash160(factoryHash),
      sc.ContractParam.integer(creationFee.toString()),
      tokenData,
    ],
  });

  const txid = await sendInvocation(account, script);
  const log = await waitForTx(txid);
  const tokenHash =
    extractTokenCreatedHash(log, factoryHash) ??
    (await getLatestCreatorToken(factoryHash, account.address));

  if (!tokenHash) {
    throw new Error("Could not determine token hash after creation");
  }

  console.log(`CREATE_TOKEN_TX=${txid}`);
  console.log(`TOKEN_HASH=${tokenHash}`);
}

async function setPlatformFee(factoryHash, newRate, offset = "0", batchSize = "50") {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: factoryHash,
    operation: "setAllTokensPlatformFee",
    args: [
      sc.ContractParam.integer(String(newRate)),
      sc.ContractParam.integer(String(offset)),
      sc.ContractParam.integer(String(batchSize)),
    ],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`SET_PLATFORM_FEE_TX=${txid}`);
}

async function setBurnRate(factoryHash, tokenHash, bps) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: factoryHash,
    operation: "setTokenBurnRate",
    args: [
      sc.ContractParam.hash160(tokenHash),
      sc.ContractParam.integer(String(bps)),
    ],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`SET_BURN_RATE_TX=${txid}`);
}

async function mintTokens(factoryHash, tokenHash, recipient, amount) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: factoryHash,
    operation: "mintTokens",
    args: [
      sc.ContractParam.hash160(tokenHash),
      sc.ContractParam.hash160(normalizeHashOrAddress(recipient)),
      sc.ContractParam.integer(String(amount)),
    ],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`MINT_TOKENS_TX=${txid}`);
}

async function transferToken(tokenHash, recipient, amount) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: tokenHash,
    operation: "transfer",
    args: [
      sc.ContractParam.hash160(account.scriptHash),
      sc.ContractParam.hash160(normalizeHashOrAddress(recipient)),
      sc.ContractParam.integer(String(amount)),
      sc.ContractParam.any(null),
    ],
  });
  const txid = await sendInvocation(account, script, "Global");
  await waitForTx(txid);
  console.log(`TRANSFER_TOKEN_TX=${txid}`);
}

async function claimCreatorFee(tokenHash, amount) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: tokenHash,
    operation: "claimCreatorFee",
    args: [sc.ContractParam.integer(String(amount))],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`CLAIM_CREATOR_FEE_TX=${txid}`);
}

async function claimAllCreatorFees(tokenHash) {
  const account = getAccountFromEnv();
  const script = sc.createScript({
    scriptHash: tokenHash,
    operation: "claimCreatorFees",
    args: [],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`CLAIM_ALL_CREATOR_FEES_TX=${txid}`);
}

async function changeMode(factoryHash, tokenHash, newMode, modeParams = []) {
  const account = getAccountFromEnv();
  const normalizedMode = String(newMode);
  const params =
    normalizedMode === "speculation"
      ? sc.ContractParam.array(
          sc.ContractParam.string(String(modeParams[0] ?? "GAS")),
          sc.ContractParam.integer(String(modeParams[1] ?? "0"))
        )
      : sc.ContractParam.array(
          ...modeParams.map((param) => sc.ContractParam.string(String(param)))
        );

  const script = sc.createScript({
    scriptHash: factoryHash,
    operation: "changeTokenMode",
    args: [
      sc.ContractParam.hash160(tokenHash),
      sc.ContractParam.string(normalizedMode),
      params,
    ],
  });
  const txid = await sendInvocation(account, script, "Global");
  await waitForTx(txid);
  console.log(`CHANGE_MODE_TX=${txid}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "set-owner" && args.length === 2) {
    await setOwner(args[0], args[1]);
    return;
  }

  if (command === "deploy-router" && args.length === 1) {
    await deployRouter(args[0]);
    return;
  }

  if (command === "fund-factory" && args.length === 2) {
    await fundFactory(args[0], args[1]);
    return;
  }

  if (command === "create-token" && args.length === 6) {
    await createToken(args[0], args[1], args[2], args[3], args[4], args[5]);
    return;
  }

  if (command === "set-platform-fee" && args.length >= 2 && args.length <= 4) {
    await setPlatformFee(args[0], args[1], args[2], args[3]);
    return;
  }

  if (command === "set-burn-rate" && args.length === 3) {
    await setBurnRate(args[0], args[1], args[2]);
    return;
  }

  if (command === "mint-tokens" && args.length === 4) {
    await mintTokens(args[0], args[1], args[2], args[3]);
    return;
  }

  if (command === "transfer-token" && args.length === 3) {
    await transferToken(args[0], args[1], args[2]);
    return;
  }

  if (command === "claim-creator-fee" && args.length === 2) {
    await claimCreatorFee(args[0], args[1]);
    return;
  }

  if (command === "claim-all-creator-fees" && args.length === 1) {
    await claimAllCreatorFees(args[0]);
    return;
  }

  if (command === "change-mode" && args.length >= 3) {
    await changeMode(args[0], args[1], args[2], args.slice(3));
    return;
  }

  console.error(
    "Usage:\n" +
      "  node scripts/factory-governance-fixtures.cjs set-owner <factoryHash> <newOwnerHashOrAddress>\n" +
      "  node scripts/factory-governance-fixtures.cjs deploy-router <factoryHash>\n" +
      "  node scripts/factory-governance-fixtures.cjs fund-factory <factoryHash> <amountDatoshi>\n" +
      "  node scripts/factory-governance-fixtures.cjs create-token <factoryHash> <name> <symbol> <supply> <decimals> <creatorFeeRateDatoshi>\n" +
      "  node scripts/factory-governance-fixtures.cjs set-platform-fee <factoryHash> <newRateDatoshi> [offset] [batchSize]\n" +
      "  node scripts/factory-governance-fixtures.cjs set-burn-rate <factoryHash> <tokenHash> <basisPoints>\n" +
      "  node scripts/factory-governance-fixtures.cjs mint-tokens <factoryHash> <tokenHash> <recipientHashOrAddress> <amountRaw>\n" +
      "  node scripts/factory-governance-fixtures.cjs transfer-token <tokenHash> <recipientHashOrAddress> <amountRaw>\n" +
      "  node scripts/factory-governance-fixtures.cjs claim-creator-fee <tokenHash> <amountRaw>\n" +
      "  node scripts/factory-governance-fixtures.cjs claim-all-creator-fees <tokenHash>\n" +
      "  node scripts/factory-governance-fixtures.cjs change-mode <factoryHash> <tokenHash> <mode> [modeParams...]"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
