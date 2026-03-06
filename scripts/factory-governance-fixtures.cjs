/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { wallet, sc, tx, u, rpc: rpcModule } = require("@cityofzion/neon-js");

const RPC_URL = process.env.NEXT_PUBLIC_NEO_RPC_URL || "http://localhost:10332";
const NETWORK_MAGIC = 5195086;
const OWNER_WIF =
  process.env.E2E_TEST_ACCOUNT_WIF ||
  "L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok";
const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHashOrAddress(value) {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  return new wallet.Account(value).scriptHash;
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

async function sendInvocation(account, scriptHex) {
  const client = new rpcModule.NeoServerRpcClient(RPC_URL);
  const signerSpec = [{ account: account.scriptHash, scopes: "CalledByEntry" }];
  const dryRun = await client.invokeScript(u.HexString.fromHex(scriptHex), signerSpec);
  if (dryRun.state === "FAULT") {
    throw new Error(`Dry-run faulted: ${dryRun.exception ?? "unknown"}`);
  }

  const blockCount = await client.getBlockCount();
  const txn = new tx.Transaction({
    signers: [{ account: account.scriptHash, scopes: tx.WitnessScope.CalledByEntry }],
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

async function setOwner(factoryHash, newOwner) {
  const account = new wallet.Account(OWNER_WIF);
  const script = sc.createScript({
    scriptHash: factoryHash,
    operation: "setOwner",
    args: [sc.ContractParam.hash160(normalizeHashOrAddress(newOwner))],
  });
  const txid = await sendInvocation(account, script);
  await waitForTx(txid);
  console.log(`SET_OWNER_TX=${txid}`);
}

async function fundFactory(factoryHash, amount) {
  const account = new wallet.Account(OWNER_WIF);
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

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "set-owner" && args.length === 2) {
    await setOwner(args[0], args[1]);
    return;
  }
  if (command === "fund-factory" && args.length === 2) {
    await fundFactory(args[0], args[1]);
    return;
  }

  console.error(
    "Usage:\n" +
      "  node scripts/factory-governance-fixtures.cjs set-owner <factoryHash> <newOwnerHashOrAddress>\n" +
      "  node scripts/factory-governance-fixtures.cjs fund-factory <factoryHash> <amountDatoshi>"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message ?? err);
  process.exit(1);
});
