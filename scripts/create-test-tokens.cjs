/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Creates 1 test token on the neo3-privatenet-docker devnet.
 *
 * Tokens:
 *   1. "E2E Upgradeable" (E2EU, community mode) — upgradeable, for update-token tests
 *
 * Note: TokenFactory only supports "community" mode; "standard"/"premium" are reserved
 * for future factory versions and will cause a FAULT if passed.
 *
 * Usage: node scripts/create-test-tokens.cjs
 *
 * Environment variables (inherit from process.env):
 *   NEXT_PUBLIC_FACTORY_CONTRACT_HASH  — required
 *   NEXT_PUBLIC_NEO_RPC_URL            — defaults to http://localhost:10332
 *   E2E_TEST_ACCOUNT_WIF               — defaults to pre-funded docker WIF
 */

"use strict";
const { wallet, sc, tx, u, rpc: rpcModule } = require("@cityofzion/neon-js");
const http = require("http");

const RPC_URL = process.env.NEXT_PUBLIC_NEO_RPC_URL || "http://localhost:10332";
const NETWORK_MAGIC = 5195086;
const WIF =
  process.env.E2E_TEST_ACCOUNT_WIF ||
  "L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok";
const FACTORY_HASH = process.env.NEXT_PUBLIC_FACTORY_CONTRACT_HASH;
const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";
// Creation fee: 15 GAS in datoshi
const CREATION_FEE = 1_500_000_000;

if (!FACTORY_HASH) {
  console.error("NEXT_PUBLIC_FACTORY_CONTRACT_HASH not set — cannot create test tokens");
  process.exit(1);
}

// ─── Raw JSON-RPC helper ──────────────────────────────────────────────────────

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(RPC_URL);
    const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
    const req = http.request(
      {
        hostname: url.hostname,
        port: parseInt(url.port, 10) || 80,
        path: url.pathname || "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const r = JSON.parse(data);
            if (r.error) reject(new Error(r.error.message));
            else resolve(r.result);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollApplicationLog(txid, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const log = await rpcCall("getapplicationlog", [txid]);
      if (log) {
        const exec = log.executions.find((e) => e.trigger === "Application");
        if (exec) {
          if (exec.vmstate === "FAULT") {
            throw new Error(`TX faulted: ${exec.exception ?? "unknown"}`);
          }
          return log;
        }
      }
    } catch (e) {
      if (e.message && e.message.includes("faulted")) throw e;
      // TX not yet in a block — keep polling
    }
    console.log("  Waiting for TX confirmation...");
    await sleep(3_000);
  }
  throw new Error(`TX ${txid} not confirmed after ${timeoutMs / 1000}s`);
}

/**
 * Builds, signs, and broadcasts a contract invocation.
 * Mirrors the pattern used by deploy-factory.cjs.
 */
async function sendInvocation(client, account, scriptHex) {
  const signerSpec = [{ account: account.scriptHash, scopes: "CalledByEntry" }];

  const dryRun = await client.invokeScript(
    u.HexString.fromHex(scriptHex),
    signerSpec
  );
  if (dryRun.state === "FAULT") {
    throw new Error(`Dry-run faulted: ${dryRun.exception ?? "(unknown)"}`);
  }
  console.log(`  Dry-run OK — gasconsumed=${dryRun.gasconsumed}`);

  const blockCount = await client.getBlockCount();
  const txn = new tx.Transaction({
    signers: [{ account: account.scriptHash, scopes: tx.WitnessScope.CalledByEntry }],
    script: u.HexString.fromHex(scriptHex),
    validUntilBlock: blockCount + 200,
    systemFee: u.BigInteger.fromDecimal(dryRun.gasconsumed, 0),
    networkFee: u.BigInteger.fromNumber(0),
  });

  const verifScript = wallet.getVerificationScriptFromPublicKey(account.publicKey);
  txn.addWitness(new tx.Witness({ invocationScript: "", verificationScript: verifScript }));

  const networkFee = await client.calculateNetworkFee(txn);
  txn.networkFee = u.BigInteger.fromDecimal(networkFee, 0);

  txn.sign(account, NETWORK_MAGIC);

  const txid = await client.sendRawTransaction(txn);
  return txid;
}

/**
 * Creates a token by transferring GAS to the factory with token params.
 * The factory's onNEP17Payment handler deploys the TokenTemplate contract.
 */
async function createToken(client, account, name, symbol, mode) {
  console.log(`\nCreating token: "${name}" (${symbol}, mode=${mode})`);

  const tokenData = sc.ContractParam.array(
    sc.ContractParam.string(name),
    sc.ContractParam.string(symbol),
    sc.ContractParam.integer(1_000_000),   // total supply
    sc.ContractParam.integer(8),           // decimals
    sc.ContractParam.string(mode),
    sc.ContractParam.string(""),           // imageUrl (empty)
    sc.ContractParam.integer(0)            // creatorFeeRate (datoshi)
  );

  // GAS transfer: transfer(from, to, amount, data)
  const script = sc.createScript({
    scriptHash: GAS_HASH,
    operation: "transfer",
    args: [
      sc.ContractParam.hash160(account.scriptHash),
      sc.ContractParam.hash160(FACTORY_HASH),
      sc.ContractParam.integer(CREATION_FEE),
      tokenData,
    ],
  });

  const txid = await sendInvocation(client, account, script);
  console.log(`  TX submitted: ${txid}`);

  const log = await pollApplicationLog(txid);
  const exec = log.executions.find((e) => e.trigger === "Application");
  console.log(`  ✓ Token "${name}" confirmed (vmstate=${exec?.vmstate})`);
  return txid;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const account = new wallet.Account(WIF);
  const client = new rpcModule.NeoServerRpcClient(RPC_URL);

  console.log(`Factory : ${FACTORY_HASH}`);
  console.log(`Account : ${account.address}`);
  console.log(`RPC URL : ${RPC_URL}`);

  // Create upgradeable community-mode token (only mode supported by factory)
  await createToken(client, account, "E2E Upgradeable", "E2EU", "community");

  console.log("\n✓ Test token created successfully");
}

main().catch((e) => {
  console.error("\nFATAL:", e.message ?? e);
  process.exit(1);
});
