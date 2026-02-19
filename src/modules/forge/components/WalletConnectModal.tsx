"use client";

import { useEffect } from "react";
import type { InstalledWallet } from "../neo-dapi-adapter";
import type { WalletType } from "../types";

interface Props {
  installedWallets: InstalledWallet[];
  onConnect: (walletType: WalletType) => void;
  onClose: () => void;
  connecting?: boolean;
  error?: string | null;
}

export function WalletConnectModal({
  installedWallets,
  onConnect,
  onClose,
  connecting = false,
  error = null,
}: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--forge-color-accent)" }}
          >
            Connect Wallet
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-sm opacity-60 hover:opacity-100"
            style={{ color: "var(--forge-text-primary)" }}
          >
            ✕
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 text-sm" style={{ color: "var(--forge-error)" }}>
            ⚠ {error}
          </p>
        )}

        {/* Wallet list or no-wallet message */}
        {installedWallets.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
            No Neo wallet detected. Install NeoLine or OneGate.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {installedWallets.map((w) => (
              <button
                key={w.type}
                disabled={connecting}
                onClick={() => onConnect(w.type)}
                className="w-full rounded-lg py-3 font-semibold transition-opacity disabled:opacity-50"
                style={{
                  background: "var(--forge-color-primary)",
                  color: "var(--forge-text-primary)",
                }}
              >
                {connecting ? "Connecting…" : w.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
