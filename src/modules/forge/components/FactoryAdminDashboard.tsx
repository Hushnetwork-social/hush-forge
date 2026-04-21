"use client";

import { useMemo, useState } from "react";
import { getClaimableFactoryGasSummary } from "../factory-governance-service";
import {
  isGovernanceMutationLocked,
  parseGasToDatoshi,
  validateGovernanceFeeInput,
  validatePartialClaimAmount,
} from "../factory-governance-logic";
import type { ClaimableFactoryAsset, FactoryConfig } from "../types";
import { FactoryConfirmDialog } from "./FactoryConfirmDialog";

export type AdminMutationPhase =
  | "idle"
  | "submitting"
  | "pending"
  | "confirming"
  | "success"
  | "error";

export interface AdminMutationState {
  phase: AdminMutationPhase;
  message: string | null;
  txHash: string | null;
  technicalDetails: string | null;
}

interface Props {
  factoryHash: string;
  connectedAddress: string;
  ownerDisplay: string;
  config: FactoryConfig;
  assets: ClaimableFactoryAsset[];
  assetsLoading: boolean;
  assetsError: string | null;
  activeMutationId: string | null;
  mutations: Record<string, AdminMutationState | undefined>;
  onRetryAssets: () => void;
  onSetCreationFee: (feeInDatoshi: bigint) => Promise<void>;
  onSetOperationFee: (feeInDatoshi: bigint) => Promise<void>;
  onSetAllTokensPlatformFee: (feeInDatoshi: bigint, offset: bigint, batchSize: bigint) => Promise<void>;
  onSetPaused: (paused: boolean) => Promise<void>;
  onUpgradeTemplate: (nefBase64: string, manifestText: string) => Promise<void>;
  onClaimAll: (assetHash: string) => Promise<void>;
  onClaim: (assetHash: string, amountRaw: bigint) => Promise<void>;
}

interface PendingConfirmation {
  title: string;
  body: string[];
  onConfirm: () => Promise<void>;
}

const MAX_PLATFORM_FEE_DATOSHI = 10_000_000n;
const MAX_PLATFORM_BATCH_SIZE = 50n;

function formatGas(datoshi: bigint): string {
  const whole = datoshi / 100_000_000n;
  const fraction = (datoshi % 100_000_000n).toString().padStart(8, "0");
  return `${whole.toLocaleString("en-US")}.${fraction}`.replace(/\.?0+$/, "") + " GAS";
}

function validatePlatformFeeInput(
  value: string
): { valid: boolean; datoshi: bigint | null; reason: string | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, datoshi: null, reason: "Platform fee is required." };
  }
  if (trimmed.startsWith("-")) {
    return { valid: false, datoshi: null, reason: "Platform fee cannot be negative." };
  }

  const datoshi = parseGasToDatoshi(trimmed);
  if (datoshi === null) {
    return {
      valid: false,
      datoshi: null,
      reason: "Enter a valid GAS amount with up to 8 decimal places.",
    };
  }
  if (datoshi > MAX_PLATFORM_FEE_DATOSHI) {
    return {
      valid: false,
      datoshi,
      reason: `Platform fee cannot exceed ${formatGas(MAX_PLATFORM_FEE_DATOSHI)}.`,
    };
  }

  return { valid: true, datoshi, reason: null };
}

function validateWholeNumberInput(
  value: string,
  label: string,
  max: bigint | null
): { valid: boolean; value: bigint | null; reason: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, value: null, reason: `${label} is required.` };
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, value: null, reason: `${label} must be a whole number.` };
  }

  const parsed = BigInt(trimmed);
  if (max !== null && parsed > max) {
    return { valid: false, value: parsed, reason: `${label} cannot exceed ${max.toString()}.` };
  }
  return { valid: true, value: parsed, reason: null };
}

function mutationSummary(state?: AdminMutationState) {
  if (!state || state.phase === "idle") return null;
  return {
    tone:
      state.phase === "error"
        ? "var(--forge-error)"
        : state.phase === "success"
          ? "var(--forge-color-primary)"
          : "var(--forge-color-accent)",
    label:
      state.phase === "submitting"
        ? "Awaiting wallet signature..."
        : state.phase === "pending"
          ? "Transaction submitted"
          : state.phase === "confirming"
            ? "Transaction in mempool"
            : state.phase === "success"
              ? "Action confirmed"
              : "Action failed",
  };
}

async function readFileAsBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function readManifestText(file: File): Promise<string> {
  return file.text();
}

export function FactoryAdminDashboard({
  factoryHash,
  connectedAddress,
  ownerDisplay,
  config,
  assets,
  assetsLoading,
  assetsError,
  activeMutationId,
  mutations,
  onRetryAssets,
  onSetCreationFee,
  onSetOperationFee,
  onSetAllTokensPlatformFee,
  onSetPaused,
  onUpgradeTemplate,
  onClaimAll,
  onClaim,
}: Props) {
  const [creationFeeInput, setCreationFeeInput] = useState("");
  const [operationFeeInput, setOperationFeeInput] = useState("");
  const [platformFeeInput, setPlatformFeeInput] = useState("");
  const [platformFeeOffsetInput, setPlatformFeeOffsetInput] = useState("0");
  const [platformFeeBatchSizeInput, setPlatformFeeBatchSizeInput] = useState("50");
  const [partialClaims, setPartialClaims] = useState<Record<string, string>>({});
  const [nefFile, setNefFile] = useState<File | null>(null);
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string | null>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const creationFeeValidation = useMemo(
    () => validateGovernanceFeeInput(creationFeeInput, config.creationFee),
    [creationFeeInput, config.creationFee]
  );
  const claimableGasSummary = useMemo(
    () => getClaimableFactoryGasSummary(assets),
    [assets]
  );
  const operationFeeValidation = useMemo(
    () => validateGovernanceFeeInput(operationFeeInput, config.operationFee),
    [operationFeeInput, config.operationFee]
  );
  const platformFeeValidation = useMemo(
    () => validatePlatformFeeInput(platformFeeInput),
    [platformFeeInput]
  );
  const platformFeeOffsetValidation = useMemo(
    () => validateWholeNumberInput(platformFeeOffsetInput, "Offset", null),
    [platformFeeOffsetInput]
  );
  const platformFeeBatchSizeValidation = useMemo(
    () => validateWholeNumberInput(platformFeeBatchSizeInput, "Batch size", MAX_PLATFORM_BATCH_SIZE),
    [platformFeeBatchSizeInput]
  );

  function setError(key: string, value: string | null) {
    setLocalErrors((current) => ({ ...current, [key]: value }));
  }

  async function submitCreationFee() {
    if (!creationFeeValidation.valid || creationFeeValidation.datoshi === null) {
      setError("creation-fee", creationFeeValidation.reason ?? "Invalid creation fee.");
      return;
    }
    setError("creation-fee", null);
    await onSetCreationFee(creationFeeValidation.datoshi);
    setCreationFeeInput("");
  }

  async function submitOperationFee() {
    if (!operationFeeValidation.valid || operationFeeValidation.datoshi === null) {
      setError("operation-fee", operationFeeValidation.reason ?? "Invalid operation fee.");
      return;
    }
    setError("operation-fee", null);
    await onSetOperationFee(operationFeeValidation.datoshi);
    setOperationFeeInput("");
  }

  async function submitPlatformFeeBatch() {
    if (!platformFeeValidation.valid || platformFeeValidation.datoshi === null) {
      setError("platform-fee-batch", platformFeeValidation.reason ?? "Invalid platform fee.");
      return;
    }
    if (!platformFeeOffsetValidation.valid || platformFeeOffsetValidation.value === null) {
      setError("platform-fee-batch", platformFeeOffsetValidation.reason ?? "Invalid offset.");
      return;
    }
    if (!platformFeeBatchSizeValidation.valid || platformFeeBatchSizeValidation.value === null) {
      setError("platform-fee-batch", platformFeeBatchSizeValidation.reason ?? "Invalid batch size.");
      return;
    }

    setError("platform-fee-batch", null);
    await onSetAllTokensPlatformFee(
      platformFeeValidation.datoshi,
      platformFeeOffsetValidation.value,
      platformFeeBatchSizeValidation.value
    );
    if (platformFeeBatchSizeValidation.value > 0n) {
      setPlatformFeeOffsetInput(
        (platformFeeOffsetValidation.value + platformFeeBatchSizeValidation.value).toString()
      );
    }
  }

  async function prepareTemplateUpgrade() {
    if (!nefFile || !manifestFile) {
      setError("upgrade", "Both NEF and manifest files are required.");
      return;
    }
    if (!nefFile.name.toLowerCase().endsWith(".nef")) {
      setError("upgrade", "Template NEF file must use the .nef extension.");
      return;
    }
    if (!manifestFile.name.toLowerCase().endsWith(".json")) {
      setError("upgrade", "Manifest file must use the .json extension.");
      return;
    }

    const manifestText = await readManifestText(manifestFile);
    try {
      JSON.parse(manifestText);
    } catch {
      setError("upgrade", "Manifest JSON is invalid.");
      return;
    }

    const nefBase64 = await readFileAsBase64(nefFile);
    setError("upgrade", null);
    setPendingConfirmation({
      title: "Upgrade Template",
      body: [
        "This upgrade affects only future token deployments. Existing deployed tokens are unchanged.",
        "The action requires wallet signature and chain confirmation.",
      ],
      onConfirm: async () => {
        await onUpgradeTemplate(nefBase64, manifestText);
        setPendingConfirmation(null);
      },
    });
  }

  function openPauseConfirmation() {
    setPendingConfirmation({
      title: config.paused ? "Unpause Factory" : "Pause Factory",
      body: [
        "Pausing blocks token creation and token alteration operations through the factory.",
        "Claims and template upgrade remain allowed while paused.",
        "The change takes effect after transaction confirmation.",
      ],
      onConfirm: async () => {
        await onSetPaused(!config.paused);
        setPendingConfirmation(null);
      },
    });
  }

  function renderMutationStatus(id: string) {
    const state = mutations[id];
    const summary = mutationSummary(state);
    const localError = localErrors[id];
    if (!summary && !localError) return null;

    return (
      <div className="mt-3 space-y-1 text-xs">
        {summary && (
          <p style={{ color: summary.tone }}>
            {summary.label}
            {state?.message ? ` - ${state.message}` : ""}
          </p>
        )}
        {state?.txHash && (
          <p style={{ color: "var(--forge-text-muted)" }}>Tx: {state.txHash}</p>
        )}
        {localError && <p role="alert" style={{ color: "var(--forge-error)" }}>{localError}</p>}
        {state?.phase === "error" && state.technicalDetails && (
          <details style={{ color: "var(--forge-text-muted)" }}>
            <summary>Technical details</summary>
            <p className="mt-1 break-all">{state.technicalDetails}</p>
          </details>
        )}
      </div>
    );
  }

  return (
    <>
      <main className="min-h-screen px-6 py-8" style={{ background: "var(--forge-bg-primary)" }}>
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <section
            className="rounded-2xl p-6"
            style={{
              background: "var(--forge-bg-card)",
              border: "1px solid var(--forge-border-medium)",
            }}
          >
            <h1 className="text-3xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              Factory Admin
            </h1>
            <p className="mt-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              TokenFactory contract owner controls. Every change is submitted as a separate
              on-chain action. Only one action can be pending at a time.
            </p>
          </section>

          <section
            className="rounded-2xl p-6"
            style={{
              background: "var(--forge-bg-card)",
              border: "1px solid var(--forge-border-medium)",
            }}
          >
            <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              Summary
            </h2>
            <dl className="grid gap-4 md:grid-cols-2">
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Contract Hash</dt><dd className="font-mono text-sm break-all">{factoryHash}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Connected Wallet</dt><dd className="font-mono text-sm">{connectedAddress}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Owner Address</dt><dd className="font-mono text-sm">{ownerDisplay}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Paused</dt><dd className="text-sm">{config.paused ? "Paused" : "Active"}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Creation Fee</dt><dd className="text-sm">{formatGas(config.creationFee)}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Operation Fee</dt><dd className="text-sm">{formatGas(config.operationFee)}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Template Hash</dt><dd className="font-mono text-sm break-all">{config.templateScriptHash}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Template Version</dt><dd className="text-sm">v{config.templateVersion.toString()}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>NEF Stored</dt><dd className="text-sm">{config.templateNefStored ? "Yes" : "No"}</dd></div>
              <div><dt className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>Manifest Stored</dt><dd className="text-sm">{config.templateManifestStored ? "Yes" : "No"}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl p-6" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h2 className="text-lg font-semibold">Creation Fee</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>Current: {formatGas(config.creationFee)}</p>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                aria-label="Creation fee GAS input"
                value={creationFeeInput}
                onChange={(event) => setCreationFeeInput(event.target.value)}
                placeholder="GAS amount"
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
              />
              <button
                onClick={() => void submitCreationFee()}
                disabled={isGovernanceMutationLocked(activeMutationId, "creation-fee")}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
              >
                Set Creation Fee
              </button>
            </div>
            {renderMutationStatus("creation-fee")}
          </section>

          <section className="rounded-2xl p-6" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h2 className="text-lg font-semibold">Operation Fee</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>Current: {formatGas(config.operationFee)}</p>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                aria-label="Operation fee GAS input"
                value={operationFeeInput}
                onChange={(event) => setOperationFeeInput(event.target.value)}
                placeholder="GAS amount"
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
              />
              <button
                onClick={() => void submitOperationFee()}
                disabled={isGovernanceMutationLocked(activeMutationId, "operation-fee")}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
              >
                Set Operation Fee
              </button>
            </div>
            {renderMutationStatus("operation-fee")}
          </section>

          <section className="rounded-2xl p-6" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h2 className="text-lg font-semibold">Platform Fee Propagation</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
              TokenFactoryOwner sets the platform-fee default for future tokens and propagates
              the same fee into existing token-local storage by registry batch.
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--forge-text-muted)" }}>
              Maximum platform fee: {formatGas(MAX_PLATFORM_FEE_DATOSHI)}. Batch size is capped at {MAX_PLATFORM_BATCH_SIZE.toString()} tokens.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_0.7fr_0.7fr_auto] md:items-end">
              <label className="text-sm">
                <span className="mb-2 block" style={{ color: "var(--forge-text-muted)" }}>
                  Platform fee
                </span>
                <input
                  aria-label="Platform fee GAS input"
                  value={platformFeeInput}
                  onChange={(event) => setPlatformFeeInput(event.target.value)}
                  placeholder="GAS amount"
                  inputMode="decimal"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block" style={{ color: "var(--forge-text-muted)" }}>
                  Offset
                </span>
                <input
                  aria-label="Platform fee offset input"
                  value={platformFeeOffsetInput}
                  onChange={(event) => setPlatformFeeOffsetInput(event.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block" style={{ color: "var(--forge-text-muted)" }}>
                  Batch size
                </span>
                <input
                  aria-label="Platform fee batch size input"
                  value={platformFeeBatchSizeInput}
                  onChange={(event) => setPlatformFeeBatchSizeInput(event.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
                />
              </label>
              <button
                onClick={() => void submitPlatformFeeBatch()}
                disabled={isGovernanceMutationLocked(activeMutationId, "platform-fee-batch")}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
              >
                Set Platform Fee Batch
              </button>
            </div>
            {renderMutationStatus("platform-fee-batch")}
          </section>

          <section className="rounded-2xl p-6" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h2 className="text-lg font-semibold">Factory Pause</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              Current state: {config.paused ? "Paused" : "Active"}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              Pausing blocks creation and token changes. Claims and template upgrade remain allowed while paused.
            </p>
            <button
              onClick={openPauseConfirmation}
              disabled={isGovernanceMutationLocked(activeMutationId, "pause")}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--forge-color-secondary)", color: "var(--forge-text-primary)" }}
            >
              {config.paused ? "Unpause Factory" : "Pause Factory"}
            </button>
            {renderMutationStatus("pause")}
          </section>

          <section className="rounded-2xl p-6" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h2 className="text-lg font-semibold">Template Upgrade</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              Current template hash and version are shown in the summary above.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-2 block">NEF file</span>
                <input
                  aria-label="Template NEF file"
                  type="file"
                  accept=".nef"
                  onChange={(event) => setNefFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block">Manifest file</span>
                <input
                  aria-label="Template manifest file"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setManifestFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <button
              onClick={() => void prepareTemplateUpgrade()}
              disabled={isGovernanceMutationLocked(activeMutationId, "upgrade")}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
            >
              Upgrade Template
            </button>
            {renderMutationStatus("upgrade")}
          </section>

          <section className="rounded-2xl p-6" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Claimable Assets</h2>
                <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  Only non-zero TokenFactory balances are listed.
                </p>
              </div>
              {assetsError && (
                <button
                  onClick={onRetryAssets}
                  className="rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ border: "1px solid var(--forge-border-medium)" }}
                >
                  Retry
                </button>
              )}
            </div>

            <div
              className="mb-4 rounded-xl p-4"
              style={{
                background: "var(--forge-bg-primary)",
                border: "1px solid var(--forge-border-subtle)",
              }}
            >
              <p
                className="text-xs uppercase"
                style={{ color: "var(--forge-text-muted)" }}
              >
                Total Claimable GAS
              </p>
              <p
                className="mt-2 text-lg font-semibold"
                style={{ color: "var(--forge-text-primary)" }}
              >
                {assetsLoading ? "Loading..." : claimableGasSummary.displayAmount}
              </p>
              <p
                className="mt-2 text-xs leading-relaxed"
                style={{ color: "var(--forge-text-muted)" }}
              >
                Claim submission still pays the normal Neo network fee
                separately in the connected wallet.
              </p>
            </div>

            {assetsLoading ? (
              <p>Loading claimable assets...</p>
            ) : assetsError ? (
              <p role="alert" style={{ color: "var(--forge-error)" }}>{assetsError}</p>
            ) : assets.length === 0 ? (
              <p style={{ color: "var(--forge-text-muted)" }}>No claimable assets were found for the factory.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead style={{ color: "var(--forge-text-muted)" }}>
                    <tr>
                      <th className="pb-3 pr-4">Asset</th>
                      <th className="pb-3 pr-4">Hash</th>
                      <th className="pb-3 pr-4">Balance</th>
                      <th className="pb-3 pr-4">Partial Amount</th>
                      <th className="pb-3 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => {
                      const mutationId = `claim:${asset.contractHash}`;
                      const validation = validatePartialClaimAmount(
                        asset,
                        partialClaims[asset.contractHash] ?? ""
                      );
                      const claimLocked = isGovernanceMutationLocked(activeMutationId, mutationId);

                      return (
                        <tr key={asset.contractHash} style={{ borderTop: "1px solid var(--forge-border-subtle)" }}>
                          <td className="py-4 pr-4">
                            <div className="font-semibold">{asset.symbol || "Unknown Asset"}</div>
                            <div style={{ color: "var(--forge-text-muted)" }}>{asset.name}</div>
                          </td>
                          <td className="py-4 pr-4 font-mono text-xs">{asset.contractHash}</td>
                          <td className="py-4 pr-4">{asset.displayAmount}</td>
                          <td className="py-4 pr-4">
                            <input
                              aria-label={`Partial amount for ${asset.contractHash}`}
                              value={partialClaims[asset.contractHash] ?? ""}
                              onChange={(event) =>
                                setPartialClaims((current) => ({
                                  ...current,
                                  [asset.contractHash]: event.target.value,
                                }))
                              }
                              disabled={!asset.partialClaimSupported || claimLocked}
                              className="w-44 rounded-lg px-3 py-2 text-sm disabled:opacity-40"
                              style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
                            />
                            {!asset.partialClaimSupported && (
                              <p className="mt-1 text-xs" style={{ color: "var(--forge-text-muted)" }}>
                                Partial claim is unavailable when asset decimals cannot be resolved.
                              </p>
                            )}
                            {asset.partialClaimSupported && partialClaims[asset.contractHash] && !validation.valid && (
                              <p className="mt-1 text-xs" style={{ color: "var(--forge-error)" }}>
                                {validation.reason}
                              </p>
                            )}
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => {
                                  if (!validation.valid || validation.amountRaw === null) {
                                    setError(mutationId, validation.reason ?? "Invalid partial claim amount.");
                                    return;
                                  }
                                  setError(mutationId, null);
                                  void onClaim(asset.contractHash, validation.amountRaw);
                                }}
                                disabled={!asset.partialClaimSupported || claimLocked}
                                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                                style={{ border: "1px solid var(--forge-border-medium)" }}
                              >
                                Claim Partial
                              </button>
                              <button
                                onClick={() => void onClaimAll(asset.contractHash)}
                                disabled={claimLocked}
                                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                                style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
                              >
                                Claim All
                              </button>
                            </div>
                            {renderMutationStatus(mutationId)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {pendingConfirmation && (
        <FactoryConfirmDialog
          title={pendingConfirmation.title}
          body={pendingConfirmation.body}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={() => void pendingConfirmation.onConfirm()}
        />
      )}
    </>
  );
}
