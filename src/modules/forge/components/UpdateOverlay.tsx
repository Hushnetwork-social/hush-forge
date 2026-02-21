"use client";

import { useEffect, useState } from "react";
import { invokeUpdate, WalletRejectedError } from "../neo-dapi-adapter";
import type { TokenInfo, UpdateParams } from "../types";

interface Props {
  token: TokenInfo;
  onClose: () => void;
  onTxSubmitted: (txHash: string) => void;
}

function formatSupply(supply: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  return (supply / factor).toLocaleString();
}

export function UpdateOverlay({ token, onClose, onTxSubmitted }: Props) {
  const [name, setName] = useState(token.name);
  const [symbol, setSymbol] = useState(token.symbol);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Escape closes (blocked while submitting)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitting, onClose]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const params: UpdateParams = { name: name.trim(), symbol };
      const txHash = await invokeUpdate(token.contractHash, params);
      onTxSubmitted(txHash);
    } catch (err) {
      if (err instanceof WalletRejectedError) {
        setSubmitError("Transaction cancelled. Please try again.");
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Update Token"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 mx-4"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid rgba(255,107,53,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--forge-color-primary)" }}
          >
            ✏️ Update Token
          </h2>
          <button
            aria-label="Close"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
            style={{ color: "var(--forge-text-primary)" }}
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {submitError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded text-sm"
            style={{
              background: "rgba(255,82,82,0.1)",
              color: "var(--forge-error)",
              border: "1px solid rgba(255,82,82,0.3)",
            }}
          >
            ⚠ {submitError}
          </div>
        )}

        {/* Info note */}
        <div
          className="mb-4 p-3 rounded text-xs"
          style={{
            background: "rgba(255,107,53,0.05)",
            color: "var(--forge-text-muted)",
            border: "1px solid var(--forge-border-subtle)",
          }}
        >
          ℹ Fields rejected by the contract will fail on-chain. Check NeoTube
          if the transaction is rejected.
        </div>

        <div className="flex flex-col gap-4">
          {/* Token Name */}
          <div>
            <label
              htmlFor="update-token-name"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Token Name
            </label>
            <input
              id="update-token-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: "1px solid var(--forge-border-medium)",
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Symbol */}
          <div>
            <label
              htmlFor="update-token-symbol"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Symbol
            </label>
            <input
              id="update-token-symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm uppercase disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: "1px solid var(--forge-border-medium)",
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Supply (read-only) */}
          <div>
            <label
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Total Supply{" "}
              <span className="text-xs">(read-only)</span>
            </label>
            <div
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--forge-bg-primary)",
                border: "1px solid var(--forge-border-subtle)",
                color: "var(--forge-text-muted)",
              }}
            >
              {formatSupply(token.supply, token.decimals)}
            </div>
          </div>

          {/* Decimals (read-only) */}
          <div>
            <label
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Decimals <span className="text-xs">(read-only)</span>
            </label>
            <div
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--forge-bg-primary)",
                border: "1px solid var(--forge-border-subtle)",
                color: "var(--forge-text-muted)",
              }}
            >
              {token.decimals}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 py-3 rounded-lg font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background:
                "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
              color: "var(--forge-text-primary)",
            }}
          >
            {submitting ? "⏳ Updating…" : "✏️ Update Token"}
          </button>
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="px-5 py-3 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: "1px solid var(--forge-border-medium)",
              color: "var(--forge-text-primary)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
