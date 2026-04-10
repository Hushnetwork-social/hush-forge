import * as Neon from "@cityofzion/neon-js";
import {
  addressToHash160,
  calculateNetworkFee,
  getBlockCount,
  invokeScript,
} from "./neo-rpc-client";
import { serializeChangeModeParams } from "./token-mode-params";
import type { ContractChangeCostQuote } from "./types";

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
    operationFeeDatoshi,
    estimatedSystemFeeDatoshi,
    estimatedNetworkFeeDatoshi,
    estimatedChainFeeDatoshi,
    estimatedTotalWalletOutflowDatoshi:
      operationFeeDatoshi + estimatedChainFeeDatoshi,
  };
}
