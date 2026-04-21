import * as Neon from "@cityofzion/neon-js";
import {
  addressToHash160,
  calculateNetworkFee,
  getBlockCount,
  invokeScript,
} from "./neo-rpc-client";
import { resolveTokenOwnerMutationRoute } from "./token-routing";
import { serializeChangeModeParams } from "./token-mode-params";
import type { ContractChangeCostQuote, TokenInfo } from "./types";

const DUMMY_FEE_ESTIMATION_PUBLIC_KEY =
  "02607a38b8010a8f401c25dd01df1b74af1827dd16b821fc07451f2ef7f02da60f";

function addTenPercentBuffer(value: bigint): bigint {
  return value + value / 10n;
}

function parseGasConsumed(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`Unexpected gasconsumed value: ${raw}`);
  }
}

function buildChangeModeScript(
  factoryHash: string,
  tokenHash: string,
  newMode: string,
  modeParams: unknown[]
): string {
  const serializedModeParams = serializeChangeModeParams(newMode, modeParams);
  const builder = new Neon.sc.ScriptBuilder();
  builder.emitContractCall({
    scriptHash: factoryHash,
    operation: "changeTokenMode",
    callFlags: Neon.sc.CallFlags.All,
    args: [
      Neon.sc.ContractParam.hash160(tokenHash),
      Neon.sc.ContractParam.string(newMode),
      Neon.sc.ContractParam.array(
        ...serializedModeParams.map((param) =>
          param.type === "Integer"
            ? Neon.sc.ContractParam.integer(param.value)
            : Neon.sc.ContractParam.string(param.value)
        )
      ),
    ],
  });
  return builder.build();
}

export type TokenOwnerMutationOperation =
  | "setMetadataUri"
  | "mint"
  | "setBurnRate"
  | "setMaxSupply"
  | "setCreatorFee"
  | "lock";

export type TokenOwnerMutationArg =
  | { type: "Hash160"; value: string }
  | { type: "Integer"; value: string | number | bigint }
  | { type: "String"; value: string };

export interface ResolvedTokenOwnerMutationCall {
  scriptHash: string;
  operation: string;
  args: TokenOwnerMutationArg[];
  ownerMutationTarget: "factory" | "token";
  tokenHashArgRequired: boolean;
  tokenId: string | null;
  leanEngineHash: string | null;
}

const FULL_OWNER_MUTATION_OPERATIONS: Record<TokenOwnerMutationOperation, string> = {
  setMetadataUri: "updateTokenMetadata",
  mint: "mintTokens",
  setBurnRate: "setTokenBurnRate",
  setMaxSupply: "setTokenMaxSupply",
  setCreatorFee: "setCreatorFee",
  lock: "lockToken",
};

function toContractParam(arg: TokenOwnerMutationArg) {
  if (arg.type === "Hash160") {
    return Neon.sc.ContractParam.hash160(arg.value);
  }

  if (arg.type === "Integer") {
    return Neon.sc.ContractParam.integer(String(arg.value));
  }

  return Neon.sc.ContractParam.string(arg.value);
}

function buildContractCallScript(
  scriptHash: string,
  operation: string,
  args: TokenOwnerMutationArg[]
): string {
  const builder = new Neon.sc.ScriptBuilder();
  builder.emitContractCall({
    scriptHash,
    operation,
    callFlags: Neon.sc.CallFlags.All,
    args: args.map(toContractParam),
  });
  return builder.build();
}

async function estimateChainCost(
  script: string,
  fromAccount: string
): Promise<{
  estimatedSystemFeeDatoshi: bigint;
  estimatedNetworkFeeDatoshi: bigint;
  estimatedChainFeeDatoshi: bigint;
}> {
  const signer = { account: fromAccount, scopes: "Global" as const };
  const [dryRun, currentHeight] = await Promise.all([
    invokeScript(script, [signer]),
    getBlockCount(),
  ]);

  const estimatedSystemFeeDatoshi = addTenPercentBuffer(
    parseGasConsumed(dryRun.gasconsumed)
  );

  const tx = new Neon.tx.Transaction({
    script: Neon.u.HexString.fromHex(script),
    validUntilBlock: currentHeight + 5760,
    signers: [
      {
        account: Neon.u.HexString.fromHex(fromAccount),
        scopes: Neon.tx.WitnessScope.Global,
      },
    ],
  });

  tx.systemFee = Neon.u.BigInteger.fromDecimal(
    estimatedSystemFeeDatoshi.toString(),
    0
  );
  tx.networkFee = Neon.u.BigInteger.fromNumber(0);
  tx.addWitness(
    new Neon.tx.Witness({
      invocationScript: "",
      verificationScript: Neon.wallet.getVerificationScriptFromPublicKey(
        DUMMY_FEE_ESTIMATION_PUBLIC_KEY
      ),
    })
  );

  const estimatedNetworkFeeDatoshi = await calculateNetworkFee(tx);
  const estimatedChainFeeDatoshi =
    estimatedSystemFeeDatoshi + estimatedNetworkFeeDatoshi;

  return {
    estimatedSystemFeeDatoshi,
    estimatedNetworkFeeDatoshi,
    estimatedChainFeeDatoshi,
  };
}

export function resolveTokenOwnerMutationCall(
  factoryHash: string,
  token: Pick<TokenInfo, "contractHash" | "tokenProfile" | "tokenId" | "leanEngineHash">,
  operation: TokenOwnerMutationOperation,
  args: TokenOwnerMutationArg[] = []
): ResolvedTokenOwnerMutationCall {
  const route = resolveTokenOwnerMutationRoute(token, factoryHash);
  const fullOperation = FULL_OWNER_MUTATION_OPERATIONS[operation];

  if (route.ownerMutationTarget === "token") {
    return {
      ...route,
      operation,
      args,
    };
  }

  return {
    ...route,
    operation: fullOperation,
    args: [{ type: "Hash160", value: token.contractHash }, ...args],
  };
}

export async function quoteTokenOwnerMutationCost(
  address: string,
  factoryHash: string,
  token: Pick<TokenInfo, "contractHash" | "tokenProfile" | "tokenId" | "leanEngineHash">,
  operation: TokenOwnerMutationOperation,
  args: TokenOwnerMutationArg[],
  operationFeeDatoshi: bigint
): Promise<ContractChangeCostQuote> {
  const fromAccount = addressToHash160(address);
  const call = resolveTokenOwnerMutationCall(factoryHash, token, operation, args);
  const script = buildContractCallScript(call.scriptHash, call.operation, call.args);
  const {
    estimatedSystemFeeDatoshi,
    estimatedNetworkFeeDatoshi,
    estimatedChainFeeDatoshi,
  } = await estimateChainCost(script, fromAccount);

  return {
    operationFeeDatoshi,
    estimatedSystemFeeDatoshi,
    estimatedNetworkFeeDatoshi,
    estimatedChainFeeDatoshi,
    estimatedTotalWalletOutflowDatoshi:
      operationFeeDatoshi + estimatedChainFeeDatoshi,
  };
}

export async function quoteChangeModeCost(
  address: string,
  factoryHash: string,
  tokenHash: string,
  newMode: string,
  modeParams: unknown[],
  operationFeeDatoshi: bigint
): Promise<ContractChangeCostQuote> {
  const fromAccount = addressToHash160(address);
  const script = buildChangeModeScript(factoryHash, tokenHash, newMode, modeParams);
  const {
    estimatedSystemFeeDatoshi,
    estimatedNetworkFeeDatoshi,
    estimatedChainFeeDatoshi,
  } = await estimateChainCost(script, fromAccount);

  return {
    operationFeeDatoshi,
    estimatedSystemFeeDatoshi,
    estimatedNetworkFeeDatoshi,
    estimatedChainFeeDatoshi,
    estimatedTotalWalletOutflowDatoshi:
      operationFeeDatoshi + estimatedChainFeeDatoshi,
  };
}
