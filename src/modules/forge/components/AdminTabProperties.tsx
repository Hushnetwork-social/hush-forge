"use client";

import { useMemo, useState } from "react";
import {
  invokeChangeMode,
  invokeSetBurnRate,
  invokeSetCreatorFee,
  WalletRejectedError,
} from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (txHash: string, message: string) => void;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  community: ["speculative", "crowdfund"],
  speculative: ["community"],
  crowdfund: [],
};

function toErrorMessage(err: unknown): string {
  if (err instanceof WalletRejectedError) return "Transaction cancelled.";
  if (err instanceof Error) return err.message;
  return String(err);
}

export function AdminTabProperties({ token, factoryHash, onTxSubmitted }: Props) {
  const initialMode = token.mode ?? "community";
  const [burnBps, setBurnBps] = useState(token.burnRate ?? 0);
  const [burnDisplay, setBurnDisplay] = useState(((token.burnRate ?? 0) / 100).toFixed(2));
  const [creatorFeeGas, setCreatorFeeGas] = useState(((token.creatorFeeRate ?? 0) / 100_000_000).toFixed(3));
  const [mode, setMode] = useState(initialMode);

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

  const modeChangeValid = mode === initialMode || allowedTransitions.includes(mode);

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
      setBurnError(toErrorMessage(err));
    } finally {
      setSavingBurn(false);
    }
  }

  async function handleSetCreatorFee() {
    if (!factoryHash) {
      setFeeError("Factory hash is not configured.");
      return;
    }

    const gasValue = Number(creatorFeeGas);
    if (Number.isNaN(gasValue) || gasValue < 0 || gasValue > 0.05) {
      setFeeError("Maximum 0.05 GAS");
      return;
    }

    setSavingFee(true);
    setFeeError(null);
    try {
      const datoshi = Math.round(gasValue * 100_000_000);
      const txHash = await invokeSetCreatorFee(factoryHash, token.contractHash, datoshi);
      onTxSubmitted(txHash, "Setting creator fee...");
    } catch (err) {
      setFeeError(toErrorMessage(err));
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

    setSavingMode(true);
    setModeError(null);
    try {
      const txHash = await invokeChangeMode(factoryHash, token.contractHash, mode, []);
      onTxSubmitted(txHash, "Changing token mode...");
    } catch (err) {
      setModeError(toErrorMessage(err));
    } finally {
      setSavingMode(false);
    }
  }

  return (
    <section className="space-y-6" aria-label="Admin Properties Tab">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>Burn Rate</h4>
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
        {burnError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{burnError}</p>}
        <button
          onClick={handleSetBurnRate}
          disabled={savingBurn}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))", color: "var(--forge-text-primary)" }}
        >
          {savingBurn ? "Saving..." : "Set Burn Rate"}
        </button>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>Creator Transfer Fee</h4>
        <input
          aria-label="Creator fee input"
          type="number"
          min={0}
          max={0.05}
          step={0.001}
          value={creatorFeeGas}
          onChange={(e) => setCreatorFeeGas(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
        {feeError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{feeError}</p>}
        <button
          onClick={handleSetCreatorFee}
          disabled={savingFee}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "transparent", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        >
          {savingFee ? "Saving..." : "Set Creator Fee"}
        </button>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>Token Mode</h4>
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
          Mode transitions are permanent.
        </p>
        {modeError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{modeError}</p>}
        <button
          onClick={handleChangeMode}
          disabled={savingMode || !modeChangeValid || mode === initialMode}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "transparent", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        >
          {savingMode ? "Saving..." : "Change Mode"}
        </button>
      </div>
    </section>
  );
}