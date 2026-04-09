"use client";

import { useMemo, useState } from "react";
import {
  invokeChangeMode,
  invokeSetBurnRate,
  invokeSetCreatorFee,
} from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";
import type { StagedChange } from "./admin-types";
import { InfoHint } from "./InfoHint";
import { toUiErrorMessage } from "./error-utils";
import { SpeculationActivationSheet } from "./SpeculationActivationSheet";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (
    txHash: string,
    message: string,
    options?: {
      targetTokenHash?: string;
      redirectPath?: string;
      marketLaunchSummary?: {
        tokenHash: string;
        pairLabel: string;
        quoteAsset: "GAS" | "NEO";
        tokenSymbol: string;
        curveInventoryRaw: string;
        retainedInventoryRaw: string;
      };
    }
  ) => void;
  onStageChange?: (change: StagedChange) => void;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  community: ["speculative", "crowdfund"],
  speculative: ["community"],
  crowdfund: [],
};

function toContractMode(mode: TokenInfo["mode"]): string {
  switch (mode) {
    case "speculative":
      return "speculation";
    case "crowdfund":
      return "crowdfunding";
    case "community":
    case "premium":
      return mode;
    default:
      return "";
  }
}

export function AdminTabProperties({ token, factoryHash, onTxSubmitted, onStageChange }: Props) {
  const initialMode = token.mode ?? "community";
  const [burnBps, setBurnBps] = useState(token.burnRate ?? 0);
  const [burnDisplay, setBurnDisplay] = useState(((token.burnRate ?? 0) / 100).toFixed(2));
  const [creatorFeeGas, setCreatorFeeGas] = useState(((token.creatorFeeRate ?? 0) / 100_000_000).toFixed(3));
  const [mode, setMode] = useState(initialMode);
  const [showSpeculationSheet, setShowSpeculationSheet] = useState(false);

  const [burnError, setBurnError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);

  const [savingBurn, setSavingBurn] = useState(false);
  const [savingFee, setSavingFee] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  const allowedTransitions = useMemo(
    () => VALID_TRANSITIONS[initialMode] ?? [],
    [initialMode]
  );
  const usesSpeculationReview = initialMode === "community" && mode === "speculative";

  const modeChangeValid = mode === initialMode || allowedTransitions.includes(mode);
  const creatorFeeValue = Number(creatorFeeGas);
  const creatorFeeValid =
    creatorFeeGas.trim() !== "" &&
    !Number.isNaN(creatorFeeValue) &&
    creatorFeeValue >= 0 &&
    creatorFeeValue <= 0.05;
  const feeValidationMessage =
    creatorFeeGas.trim() !== "" && !creatorFeeValid
      ? "Creator transfer fee must be between 0 and 0.05 GAS."
      : null;

  function onSliderChange(value: number) {
    setBurnBps(value);
    setBurnDisplay((value / 100).toFixed(2));
  }

  function onBurnInputChange(value: string) {
    setBurnDisplay(value);
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      const bounded = Math.max(0, Math.min(10, parsed));
      setBurnBps(Math.round(bounded * 100));
    }
  }

  async function handleSetBurnRate() {
    if (!factoryHash) {
      setBurnError("Factory hash is not configured.");
      return;
    }

    setSavingBurn(true);
    setBurnError(null);
    try {
      const txHash = await invokeSetBurnRate(factoryHash, token.contractHash, burnBps);
      onTxSubmitted(txHash, "Setting burn rate...");
    } catch (err) {
      setBurnError(toUiErrorMessage(err));
    } finally {
      setSavingBurn(false);
    }
  }

  async function handleSetCreatorFee() {
    if (!factoryHash) {
      setFeeError("Factory hash is not configured.");
      return;
    }

    if (!creatorFeeValid) {
      setFeeError("Creator transfer fee must be between 0 and 0.05 GAS.");
      return;
    }

    setSavingFee(true);
    setFeeError(null);
    try {
      const datoshi = Math.round(creatorFeeValue * 100_000_000);
      const txHash = await invokeSetCreatorFee(factoryHash, token.contractHash, datoshi);
      onTxSubmitted(txHash, "Setting creator fee...");
    } catch (err) {
      setFeeError(toUiErrorMessage(err));
    } finally {
      setSavingFee(false);
    }
  }

  async function handleChangeMode() {
    if (!factoryHash) {
      setModeError("Factory hash is not configured.");
      return;
    }

    if (!modeChangeValid) {
      setModeError(`Cannot transition from ${initialMode}`);
      return;
    }

    if (usesSpeculationReview) {
      setModeError(null);
      setShowSpeculationSheet(true);
      return;
    }

    setSavingMode(true);
    setModeError(null);
    try {
      const txHash = await invokeChangeMode(
        factoryHash,
        token.contractHash,
        toContractMode(mode),
        []
      );
      onTxSubmitted(txHash, "Changing token mode...");
    } catch (err) {
      setModeError(toUiErrorMessage(err));
    } finally {
      setSavingMode(false);
    }
  }

  function handleStageBurnRate() {
    onStageChange?.({
      id: `burnRate-${token.contractHash}`,
      type: "burnRate",
      label: `Set burn rate to ${(burnBps / 100).toFixed(2)}%`,
      payload: { basisPoints: burnBps },
    });
  }

  function handleStageCreatorFee() {
    if (!creatorFeeValid) return;
    onStageChange?.({
      id: `creatorFee-${token.contractHash}`,
      type: "creatorFee",
      label: `Set creator fee to ${creatorFeeValue.toFixed(3)} GAS`,
      payload: { datoshi: Math.round(creatorFeeValue * 100_000_000) },
    });
  }

  function handleStageMode() {
    if (!modeChangeValid || mode === initialMode) return;
    onStageChange?.({
      id: `mode-${token.contractHash}`,
      type: "mode",
      label: `Change mode ${initialMode} -> ${mode}`,
      payload: { mode: toContractMode(mode) },
    });
  }

  return (
    <section className="space-y-6" aria-label="Admin Properties Tab">
      <div className="space-y-2">
        <InfoHint
          label="Burn Rate"
          hint="Percentage of every transfer that is permanently burned. 100 bps = 1.00% and the allowed range is 0% to 10%."
        />
        <input
          aria-label="Burn rate slider"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={burnBps}
          onChange={(e) => onSliderChange(Number(e.target.value))}
          className="w-full"
        />
        <input
          aria-label="Burn rate input"
          value={burnDisplay}
          onChange={(e) => onBurnInputChange(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          Transfer burn rate in percent (0.00 to 10.00). Applies to token transfers.
        </p>
        {burnError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{burnError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSetBurnRate}
            disabled={savingBurn}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))", color: "var(--forge-text-primary)" }}
          >
            {savingBurn ? "Saving..." : "Set Burn Rate"}
          </button>
          <button
            onClick={handleStageBurnRate}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            Stage
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <InfoHint
          label="Creator Transfer Fee"
          hint="Flat fee paid in GAS on each token transfer, routed to the token creator. Allowed range is 0 to 0.05 GAS."
        />
        <input
          aria-label="Creator fee input"
          type="text"
          inputMode="decimal"
          value={creatorFeeGas}
          onChange={(e) => setCreatorFeeGas(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{
            background: "var(--forge-bg-primary)",
            border: `1px solid ${feeError || feeValidationMessage ? "var(--forge-error)" : "var(--forge-border-medium)"}`,
            color: "var(--forge-text-primary)",
          }}
        />
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          Fee per transfer in GAS (0 to 0.05). Example: 0.010 means 0.01 GAS charged on each transfer.
        </p>
        {feeValidationMessage && (
          <p className="text-xs" style={{ color: "var(--forge-error)" }}>
            {feeValidationMessage}
          </p>
        )}
        {feeError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{feeError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSetCreatorFee}
            disabled={savingFee}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "transparent", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            {savingFee ? "Saving..." : "Set Creator Fee"}
          </button>
          <button
            onClick={handleStageCreatorFee}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            Stage
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <InfoHint
          label="Token Mode"
          hint="Controls token behavior profile. Some transitions are one-way and cannot be undone."
        />
        <select
          aria-label="Mode selector"
          value={mode}
          onChange={(e) => setMode(e.target.value as TokenInfo["mode"] ?? "community")}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        >
          {["community", "speculative", "crowdfund"].map((candidate) => {
            const disabled =
              candidate !== initialMode && !allowedTransitions.includes(candidate);
            return (
              <option key={candidate} value={candidate} disabled={disabled}>
                {candidate}
              </option>
            );
          })}
        </select>
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          {usesSpeculationReview
            ? "Launching speculation requires quote-asset and curve-inventory review before signature."
            : "Mode transitions are permanent and may unlock or disable protocol features."}
        </p>
        {modeError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{modeError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleChangeMode}
            disabled={savingMode || !modeChangeValid || mode === initialMode}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "transparent", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            {savingMode ? "Saving..." : usesSpeculationReview ? "Review Launch" : "Change Mode"}
          </button>
          {!usesSpeculationReview && (
            <button
              onClick={handleStageMode}
              disabled={!modeChangeValid || mode === initialMode}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
            >
              Stage
            </button>
          )}
        </div>
      </div>

      <SpeculationActivationSheet
        open={showSpeculationSheet}
        token={token}
        factoryHash={factoryHash}
        onClose={() => setShowSpeculationSheet(false)}
        onTxSubmitted={onTxSubmitted}
      />
    </section>
  );
}
