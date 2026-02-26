"use client";

import { useState } from "react";
import { invokeLockToken, WalletRejectedError } from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (txHash: string, message: string) => void;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof WalletRejectedError) return "Transaction cancelled.";
  if (err instanceof Error) return err.message;
  return String(err);
}

export function AdminTabDangerZone({ token, factoryHash, onTxSubmitted }: Props) {
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
      setError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Admin Danger Zone Tab">
      <div
        className="rounded-lg p-4"
        style={{ border: "1px solid rgba(255,82,82,0.4)", background: "rgba(255,82,82,0.08)" }}
      >
        <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--forge-text-primary)" }}>
          DANGER ZONE
        </h4>
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          Once locked, this token is permanently immutable.
        </p>
      </div>

      <div>
        <label htmlFor="lock-confirm" className="text-sm mb-1 block" style={{ color: "var(--forge-text-muted)" }}>
          To confirm, type the token symbol:
        </label>
        <input
          id="lock-confirm"
          placeholder={token.symbol}
          value={confirmValue}
          onChange={(e) => setConfirmValue(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
      </div>

      {error && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{error}</p>}

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
    </section>
  );
}