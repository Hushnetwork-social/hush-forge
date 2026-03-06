"use client";

import { useEffect } from "react";
import { NEOTUBE_BASE_URL } from "../forge-config";

interface Props {
  message: string;
  txHash?: string;
  onDismiss: () => void;
}

export function FactoryAdminSuccessToast({ message, txHash, onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-96 rounded-lg p-4 shadow-lg"
      style={{
        background: "var(--forge-bg-card)",
        borderLeft: "4px solid var(--forge-color-primary)",
        color: "var(--forge-text-primary)",
      }}
    >
      <div className="mb-2 flex items-start justify-between">
        <p className="font-bold">Admin Action Confirmed</p>
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100"
          style={{ color: "var(--forge-text-primary)" }}
        >
          x
        </button>
      </div>
      <p className="mb-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>
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
          View on NeoTube
        </a>
      )}
    </div>
  );
}
