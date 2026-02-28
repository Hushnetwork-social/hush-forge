"use client";

import { useEffect } from "react";
import { NEOTUBE_BASE_URL } from "../forge-config";

interface PendingProps {
  message: string;
  txHash: string;
  status: "pending" | "confirming";
  onDismiss?: () => void;
}

export function ForgePendingToast({
  message,
  txHash,
  status,
  onDismiss,
}: PendingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Pending transaction status"
      className="fixed bottom-4 right-4 z-50 w-96 rounded-lg p-4 shadow-lg"
      style={{
        background: "var(--forge-bg-card)",
        borderLeft: "4px solid var(--forge-color-accent)",
        color: "var(--forge-text-primary)",
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <p className="font-bold">
          {status === "confirming"
            ? "Transaction in mempool"
            : "Transaction submitted"}
        </p>
        {onDismiss && (
          <button
            aria-label="Dismiss"
            onClick={onDismiss}
            className="opacity-60 hover:opacity-100"
            style={{ color: "var(--forge-text-primary)" }}
          >
            ×
          </button>
        )}
      </div>
      <p className="text-sm mb-2" style={{ color: "var(--forge-text-muted)" }}>
        {message}
      </p>
      <p className="text-xs mb-2" style={{ color: "var(--forge-text-muted)" }}>
        You can keep using the app while confirmation is pending.
      </p>
      <a
        href={`${NEOTUBE_BASE_URL}/transaction/${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs"
        style={{ color: "var(--forge-color-accent)" }}
      >
        Track transaction on NeoTube ↗
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success toast
// ---------------------------------------------------------------------------

interface SuccessProps {
  symbol: string;
  blockNumber?: number;
  onViewToken: () => void;
  onDismiss: () => void;
}

export function ForgeSuccessToast({
  symbol,
  blockNumber,
  onViewToken,
  onDismiss,
}: SuccessProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg p-4 shadow-lg"
      style={{
        background: "var(--forge-bg-card)",
        borderLeft: "4px solid var(--forge-color-primary)",
        color: "var(--forge-text-primary)",
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <p className="font-bold">🔥 Token Forged!</p>
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100"
          style={{ color: "var(--forge-text-primary)" }}
        >
          ✕
        </button>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--forge-text-muted)" }}>
        {symbol}
        {blockNumber !== undefined ? ` · Block #${blockNumber}` : ""}
      </p>
      <button
        onClick={onViewToken}
        className="text-sm font-semibold"
        style={{ color: "var(--forge-color-primary)" }}
      >
        View Token →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------

interface ErrorProps {
  message: string;
  txHash?: string;
  onDismiss: () => void;
}

export function ForgeErrorToast({ message, txHash, onDismiss }: ErrorProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg p-4 shadow-lg"
      style={{
        background: "var(--forge-bg-card)",
        borderLeft: "4px solid var(--forge-color-secondary)",
        color: "var(--forge-text-primary)",
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <p className="font-bold">⚠ Transaction Failed</p>
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100"
          style={{ color: "var(--forge-text-primary)" }}
        >
          ✕
        </button>
      </div>
      <p className="text-sm mb-2" style={{ color: "var(--forge-text-muted)" }}>
        {message}
      </p>
      {txHash && (
        <a
          href={`${NEOTUBE_BASE_URL}/transaction/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs"
          style={{ color: "var(--forge-color-accent)" }}
        >
          View on NeoTube ↗
        </a>
      )}
    </div>
  );
}
