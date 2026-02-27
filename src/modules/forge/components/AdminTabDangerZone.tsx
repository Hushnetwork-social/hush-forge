"use client";

import { useState } from "react";
import { invokeLockToken } from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";
import type { StagedChange } from "./admin-types";
import { InfoHint } from "./InfoHint";
import { toUiErrorMessage } from "./error-utils";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (txHash: string, message: string) => void;
  onStageChange?: (change: StagedChange) => void;
}

export function AdminTabDangerZone({ token, factoryHash, onTxSubmitted, onStageChange }: Props) {
  const [confirmValue, setConfirmValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canLock = confirmValue === token.symbol && !submitting;

  async function handleLock() {
    if (!factoryHash) {
      setError("Factory hash is not configured.");
      return;
    }

    if (!canLock) return;

    setSubmitting(true);
    setError(null);
    try {
      const txHash = await invokeLockToken(factoryHash, token.contractHash);
      onTxSubmitted(txHash, "Locking token...");
    } catch (err) {
      setError(toUiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleStageLock() {
    if (!canLock) return;
    onStageChange?.({
      id: `lock-${token.contractHash}`,
      type: "lock",
      label: "Lock token permanently",
      payload: { symbolConfirmed: true },
    });
  }

  return (
    <section className="space-y-4" aria-label="Admin Danger Zone Tab">
      <div
        className="rounded-lg p-4"
        style={{ border: "1px solid rgba(255,82,82,0.4)", background: "rgba(255,82,82,0.08)" }}
      >
        <InfoHint
          label="DANGER ZONE"
          hint="Locking is irreversible. After lock, metadata, fees, mode, minting, and all other admin setters are permanently disabled on-chain."
        />
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          Once locked, this token is permanently immutable.
        </p>
      </div>

      <div>
        <div className="mb-1">
          <InfoHint
            label="Confirmation"
            htmlFor="lock-confirm"
            hint="Type the exact token symbol (case-sensitive) to confirm you understand the permanent lock action."
          />
        </div>
        <input
          id="lock-confirm"
          placeholder={token.symbol}
          value={confirmValue}
          onChange={(e) => setConfirmValue(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
        <p className="text-xs mt-2" style={{ color: "var(--forge-text-muted)" }}>
          Exact match required: <strong style={{ color: "var(--forge-text-primary)" }}>{token.symbol}</strong> (case-sensitive).
        </p>
      </div>

      {error && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleLock}
          disabled={!canLock}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{
            border: "1px solid rgba(255,82,82,0.7)",
            background: "rgba(255,82,82,0.15)",
            color: "var(--forge-text-primary)",
          }}
        >
          {submitting ? "Locking..." : "Lock Token Forever"}
        </button>
        <button
          onClick={handleStageLock}
          disabled={!canLock}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        >
          Stage
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
        `Stage` queues this action for later batch apply. `Lock Token Forever` submits immediately.
      </p>
    </section>
  );
}
