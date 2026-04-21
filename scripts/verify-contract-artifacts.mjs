import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const forgeRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(forgeRoot, "..");
const publicContractsDir = path.join(forgeRoot, "public", "contracts");
const compiledContractsDir = path.join(workspaceRoot, "hush-neo-contracts", "src");

const artifactPairs = [
  {
    label: "LeanTokenTemplate.nef",
    source: path.join(compiledContractsDir, "LeanTokenTemplate", "bin", "sc", "LeanTokenTemplate.nef"),
    published: path.join(publicContractsDir, "LeanTokenTemplate.nef"),
  },
  {
    label: "LeanTokenTemplate.manifest.json",
    source: path.join(compiledContractsDir, "LeanTokenTemplate", "bin", "sc", "LeanTokenTemplate.manifest.json"),
    published: path.join(publicContractsDir, "LeanTokenTemplate.manifest.json"),
  },
  {
    label: "TokenFactory.nef",
    source: path.join(compiledContractsDir, "TokenFactory", "bin", "sc", "TokenFactory.nef"),
    published: path.join(publicContractsDir, "TokenFactory.nef"),
  },
  {
    label: "TokenFactory.manifest.json",
    source: path.join(compiledContractsDir, "TokenFactory", "bin", "sc", "TokenFactory.manifest.json"),
    published: path.join(publicContractsDir, "TokenFactory.manifest.json"),
  },
];

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing artifact: ${filePath}`);
  }

  return fs.readFileSync(filePath);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertByteMatch(pair) {
  const source = readRequired(pair.source);
  const published = readRequired(pair.published);

  if (!source.equals(published)) {
    throw new Error(
      `${pair.label} is stale. Source sha256=${sha256(source)} published sha256=${sha256(published)}`
    );
  }

  console.log(`[ok] ${pair.label} sha256=${sha256(published)}`);
}

function parseManifest(name) {
  const manifestPath = path.join(publicContractsDir, name);
  return JSON.parse(readRequired(manifestPath).toString("utf8"));
}

function assertMethods(manifest, methods, label) {
  const exposed = new Set((manifest.abi?.methods ?? []).map((method) => method.name));
  for (const method of methods) {
    if (!exposed.has(method)) {
      throw new Error(`${label} missing ABI method: ${method}`);
    }
  }
}

function assertLeanManifest() {
  const manifest = parseManifest("LeanTokenTemplate.manifest.json");
  const standards = new Set(manifest.supportedstandards ?? []);
  if (!standards.has("NEP-17")) {
    throw new Error("LeanTokenTemplate manifest must declare NEP-17 support.");
  }

  assertMethods(
    manifest,
    [
      "symbol",
      "decimals",
      "totalSupply",
      "balanceOf",
      "transfer",
      "quoteTransfer",
      "getOwner",
      "mint",
      "lock",
      "getMaxSupply",
      "setMaxSupply",
      "getBurnRate",
      "setBurnRate",
      "getCreatorFeeRate",
      "setCreatorFee",
      "getPlatformFeeRate",
      "setPlatformFeeRate",
      "getClaimableCreatorFee",
      "claimCreatorFee",
      "claimCreatorFees",
      "setMetadataUri",
    ],
    "LeanTokenTemplate"
  );
}

function assertFactoryManifest() {
  const manifest = parseManifest("TokenFactory.manifest.json");
  assertMethods(
    manifest,
    [
      "getTokenProfile",
      "isLeanInitialized",
      "getLeanTemplateConfig",
      "setLeanNefAndManifest",
      "upgradeLeanTemplate",
      "getPlatformFeeRate",
      "setAllTokensPlatformFee",
    ],
    "TokenFactory"
  );
}

function assertFullTemplateStillAvailable() {
  readRequired(path.join(publicContractsDir, "TokenTemplate.nef"));
  const manifest = parseManifest("TokenTemplate.manifest.json");
  const standards = new Set(manifest.supportedstandards ?? []);
  if (!standards.has("NEP-17")) {
    throw new Error("TokenTemplate manifest must remain available and declare NEP-17 support.");
  }
}

for (const pair of artifactPairs) {
  assertByteMatch(pair);
}

assertLeanManifest();
assertFactoryManifest();
assertFullTemplateStillAvailable();

console.log("[ok] Published contract artifacts are current for FEAT-109.");
