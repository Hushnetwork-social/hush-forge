/**
 * Deploys and initializes TokenFactory on the local Neo N3 private devnet.
 * Uses @cityofzion/neon-js directly — no NeoLine required.
 *
 * Usage: node scripts/deploy-factory.cjs
 *
 * On success, prints the factory hash to copy into .env.local:
 *   NEXT_PUBLIC_FACTORY_CONTRACT_HASH=0x...
 *
 * Safe to re-run: if TokenFactory is already deployed it skips Step 1.
 */

"use strict";
const { wallet, sc, tx, u, rpc: rpcModule } = require("@cityofzion/neon-js");
const fs = require("fs");
const path = require("path");
const http = require("http");

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = "http://localhost:10332";
const NETWORK_MAGIC = 5195086;
const WIF = "L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok";
const PUBLIC_DIR = path.join(__dirname, "../public/contracts");
const CONTRACT_MANAGEMENT = "0xfffdc93764dbaddd97c48f252a53ea4643faa3fd";

// ─── Raw JSON-RPC helper (works around missing getApplicationLog in NeoServerRpcClient) ─────

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
    const req = http.request(
      {
        hostname: "localhost",
        port: 10332,
        path: "/",
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      // tx not yet in block — keep polling
    }
    console.log("  Waiting for TX to be included in a block...");
    await sleep(3000);
  }
  throw new Error(`TX ${txid} not confirmed after ${timeoutMs / 1000}s`);
}

function extractDeployedHash(log) {
  const MGMT = CONTRACT_MANAGEMENT.toLowerCase();
  for (const exec of log.executions) {
    if (exec.trigger !== "Application") continue;
    const notifs = exec.notifications ?? [];
    console.log(`  AppLog: ${notifs.length} notification(s)`);
    for (const n of notifs) {
      console.log(`    contract=${n.contract} event=${n.eventname}`);
      if (n.contract.toLowerCase() === MGMT && n.eventname === "Deploy") {
        const item = n.state.value[0];
        console.log(`    Deploy state[0]: type=${item?.type} value=${JSON.stringify(item?.value)}`);
        if (item?.type === "ByteString" && typeof item.value === "string") {
          const bytes = Buffer.from(item.value, "base64");
          if (bytes.length === 20) {
            // The AppLog returns the hash as raw LE bytes (ByteString in VM).
            // Neo RPC getcontractstate expects these bytes REVERSED (big-endian hash).
            const rawHex = bytes.toString("hex");
            const reversedHex = rawHex.match(/.{2}/g).reverse().join("");
            console.log(`    Raw LE bytes: 0x${rawHex}`);
            console.log(`    Reversed (RPC hash): 0x${reversedHex}`);
            return "0x" + reversedHex;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Builds, signs, and broadcasts a contract invocation transaction.
 * Returns the 0x-prefixed txid.
 */
async function sendInvocation(client, account, scriptHex) {
  const signerSpec = [{ account: account.scriptHash, scopes: "CalledByEntry" }];

  // 1. Dry-run to get system fee
  const dryRun = await client.invokeScript(
    u.HexString.fromHex(scriptHex),
    signerSpec
  );
  if (dryRun.state === "FAULT") {
    throw new Error(`Script dry-run faulted: ${dryRun.exception ?? "(unknown)"}`);
  }
  console.log(`  Dry-run OK, gasconsumed=${dryRun.gasconsumed}`);

  // 2. Get current block height
  const blockCount = await client.getBlockCount();

  // 3. Build transaction
  const txn = new tx.Transaction({
    signers: [{ account: account.scriptHash, scopes: tx.WitnessScope.CalledByEntry }],
    script: u.HexString.fromHex(scriptHex),
    validUntilBlock: blockCount + 200,
    systemFee: u.BigInteger.fromDecimal(dryRun.gasconsumed, 0),
    networkFee: u.BigInteger.fromNumber(0),
  });

  // 4. Add empty witness placeholder (needed for calculateNetworkFee)
  const verifScript = wallet.getVerificationScriptFromPublicKey(account.publicKey);
  txn.addWitness(new tx.Witness({ invocationScript: "", verificationScript: verifScript }));

  // 5. Calculate network fee (sends tx WITH empty witnesses)
  const networkFee = await client.calculateNetworkFee(txn);
  txn.networkFee = u.BigInteger.fromDecimal(networkFee, 0);
  console.log(`  networkFee=${networkFee} datoshi`);

  // 6. Sign (replaces the empty witness invocation with real signature)
  txn.sign(account, NETWORK_MAGIC);

  // 7. Broadcast
  const txid = await client.sendRawTransaction(txn);
  return txid;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const account = new wallet.Account(WIF);
  console.log("Account:", account.address);
  console.log("ScriptHash:", account.scriptHash);

  const client = new rpcModule.NeoServerRpcClient(RPC_URL);

  // Check connectivity
  const version = await rpcCall("getversion", []);
  console.log("RPC connected — network magic:", version.protocol?.network ?? "(unknown)");
  console.log("Block height:", await rpcCall("getblockcount", []));

  // ── Load contracts ──────────────────────────────────────────────────────────
  const factoryNef = fs.readFileSync(path.join(PUBLIC_DIR, "TokenFactory.nef"));
  const factoryManifest = fs.readFileSync(
    path.join(PUBLIC_DIR, "TokenFactory.manifest.json"),
    "utf8"
  );
  const templateNef = fs.readFileSync(path.join(PUBLIC_DIR, "TokenTemplate.nef"));
  const templateManifest = fs.readFileSync(
    path.join(PUBLIC_DIR, "TokenTemplate.manifest.json"),
    "utf8"
  );

  console.log(
    `Factory NEF: ${factoryNef.length} bytes, manifest: ${factoryManifest.length} chars`
  );
  console.log(
    `Template NEF: ${templateNef.length} bytes, manifest: ${templateManifest.length} chars`
  );

  // ── Step 1: Deploy TokenFactory (skip if already deployed) ──────────────────
  console.log("\n=== Step 1: Deploying TokenFactory ===");

  // First check if we need to deploy by trying to compute the expected hash
  // and checking if it exists already.
  let factoryHash = null;

  const deployScript = sc.createScript({
    scriptHash: CONTRACT_MANAGEMENT,
    operation: "deploy",
    args: [
      // ContractParam.byteArray(string) expects base64 — it double-reverses internally
      // to produce the original bytes in the VM script.
      sc.ContractParam.byteArray(factoryNef.toString("base64")),
      sc.ContractParam.string(factoryManifest),
      sc.ContractParam.any(null),
    ],
  });

  try {
    const deployTxid = await sendInvocation(client, account, deployScript);
    console.log("Deploy TX:", deployTxid);

    const deployLog = await pollApplicationLog(deployTxid);
    factoryHash = extractDeployedHash(deployLog);

    if (!factoryHash) {
      console.error("Could not extract factory hash from deploy log!");
      console.error("Full notifications:", JSON.stringify(
        deployLog.executions[0]?.notifications ?? [], null, 2
      ));
      process.exit(1);
    }
  } catch (e) {
    // Check if the contract already exists — this happens if the script is re-run
    // on a chain where the factory was previously deployed with the same sender+NEF.
    if (e.message && e.message.toLowerCase().includes("already exists")) {
      console.log("  Contract already deployed. Recovering hash from dry-run exception...");
      // The error message may contain the hash; if not, we need to compute it.
      const m = /0x[0-9a-fA-F]{40}/i.exec(e.message);
      if (m) {
        factoryHash = m[0].toLowerCase();
        console.log("  Recovered hash from error:", factoryHash);
      }
    }
    if (!factoryHash) throw e;
  }

  // Verify the hash is reachable on-chain
  for (let i = 0; i < 10; i++) {
    try {
      const state = await rpcCall("getcontractstate", [factoryHash]);
      if (state) {
        console.log(`\n✓ TokenFactory confirmed on-chain: ${factoryHash}`);
        console.log(`  Manifest name: ${state.manifest?.name ?? "(unknown)"}`);
        break;
      }
    } catch { /* not yet visible */ }
    if (i === 9) {
      console.warn("Warning: contract state not visible after 30s — continuing anyway");
    } else {
      console.log(`  Waiting for contract state to be visible... (${i + 1}/10)`);
      await sleep(3000);
    }
  }

  // ── Step 2: Initialize factory (setNefAndManifest) ──────────────────────────
  console.log("\n=== Step 2: Initializing TokenFactory ===");

  // Check if already initialized
  try {
    const isInitResult = await rpcCall("invokefunction", [
      factoryHash, "isInitialized", [], []
    ]);
    const alreadyInit = isInitResult?.stack?.[0]?.value === true ||
                        isInitResult?.stack?.[0]?.value === "1";
    if (alreadyInit) {
      console.log("  Factory is already initialized — skipping init step.");
      console.log("\n=== SUCCESS ===");
      console.log("TokenFactory hash:", factoryHash);
      console.log("\nAdd to .env.local:");
      console.log(`NEXT_PUBLIC_FACTORY_CONTRACT_HASH=${factoryHash}`);
      return;
    }
  } catch { /* ignore — will attempt init */ }

  await sleep(2000); // let state settle

  const initScript = sc.createScript({
    scriptHash: factoryHash,
    operation: "setNefAndManifest",
    args: [
      sc.ContractParam.byteArray(templateNef.toString("base64")),
      sc.ContractParam.string(templateManifest),
    ],
  });

  const initTxid = await sendInvocation(client, account, initScript);
  console.log("Init TX:", initTxid);

  const initLog = await pollApplicationLog(initTxid);
  const initExec = initLog.executions.find((e) => e.trigger === "Application");
  console.log("Init vmstate:", initExec?.vmstate);

  if (initExec?.vmstate === "FAULT") {
    throw new Error(`Init TX faulted: ${initExec.exception ?? "unknown"}`);
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  console.log("\n=== SUCCESS ===");
  console.log("TokenFactory hash:", factoryHash);
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_FACTORY_CONTRACT_HASH=${factoryHash}`);
}

main().catch((e) => {
  console.error("\nFATAL:", e.message ?? e);
  process.exit(1);
});
