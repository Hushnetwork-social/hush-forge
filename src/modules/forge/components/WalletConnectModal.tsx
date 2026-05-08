"use client";

import { useEffect, useState } from "react";
import type { InstalledWallet } from "../neo-dapi-adapter";
import type { WalletType } from "../types";

declare global {
  interface Window {
    __FORGE_LAST_WALLETCONNECT_URI?: string;
  }
}

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
  const [walletConnectUri, setWalletConnectUri] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copy URI");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    function showWalletConnectUri(uri: unknown) {
      if (typeof uri !== "string" || !uri.trim()) return;

      setWalletConnectUri(uri);
      setCopyStatus("Copy URI");
    }

    function handleWalletConnectUri(event: Event) {
      showWalletConnectUri((event as CustomEvent<string>).detail);
    }

    showWalletConnectUri(window.__FORGE_LAST_WALLETCONNECT_URI);
    window.addEventListener("forge:walletconnect-uri", handleWalletConnectUri);
    return () =>
      window.removeEventListener(
        "forge:walletconnect-uri",
        handleWalletConnectUri
      );
  }, []);

  async function copyWalletConnectUri() {
    try {
      await navigator.clipboard.writeText(walletConnectUri);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6"
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
            {installedWallets.map((wallet) => {
              const unavailable = wallet.available === false;
              const reasonId = `${wallet.type}-disabled-reason`;

              return (
                <div key={wallet.type} className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={connecting || unavailable}
                    aria-describedby={
                      unavailable && wallet.disabledReason ? reasonId : undefined
                    }
                    onClick={() => {
                      if (!unavailable) onConnect(wallet.type);
                    }}
                    className="w-full rounded-lg py-3 font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: "var(--forge-color-primary)",
                      color: "var(--forge-text-primary)",
                    }}
                  >
                    {connecting && !unavailable ? "Connecting…" : wallet.name}
                  </button>
                  {unavailable && wallet.disabledReason && (
                    <p
                      id={reasonId}
                      className="text-xs leading-snug"
                      style={{ color: "var(--forge-text-muted)" }}
                    >
                      {wallet.disabledReason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {walletConnectUri && (
          <div className="mt-4 flex flex-col gap-2">
            <label
              htmlFor="walletconnect-uri"
              className="text-xs font-semibold"
              style={{ color: "var(--forge-text-muted)" }}
            >
              WalletConnect URI
            </label>
            <textarea
              id="walletconnect-uri"
              aria-label="WalletConnect URI"
              className="min-h-20 w-full resize-none rounded-lg p-2 text-xs"
              readOnly
              value={walletConnectUri}
              style={{
                background: "var(--forge-bg)",
                border: "1px solid var(--forge-border-medium)",
                color: "var(--forge-text-primary)",
              }}
            />
            <button
              type="button"
              className="w-full rounded-lg py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              onClick={copyWalletConnectUri}
              style={{
                background: "var(--forge-color-primary)",
                color: "var(--forge-text-primary)",
              }}
            >
              {copyStatus}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
