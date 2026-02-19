"use client";

import { useState } from "react";
import type { WalletBalance } from "../types";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface Props {
  connectionStatus: ConnectionStatus;
  address: string | null;
  balances: WalletBalance[];
  onConnectClick: () => void;
  onDisconnect: () => void;
  errorMessage?: string | null;
}

const MAX_VISIBLE = 5;

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function WalletPanel({
  connectionStatus,
  address,
  balances,
  onConnectClick,
  onDisconnect,
  errorMessage,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const visibleBalances = expanded ? balances : balances.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(0, balances.length - MAX_VISIBLE);

  async function handleCopyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (connectionStatus === "disconnected" || connectionStatus === "error") {
    return (
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        {errorMessage && (
          <p className="mb-3 text-sm" style={{ color: "var(--forge-error)" }}>
            {errorMessage}
          </p>
        )}
        <p
          className="mb-4 text-sm text-center"
          style={{ color: "var(--forge-text-muted)" }}
        >
          Connect your Neo wallet to see your portfolio
        </p>
        <button
          onClick={onConnectClick}
          className="w-full rounded-lg py-2 font-semibold"
          style={{
            background: "var(--forge-color-primary)",
            color: "var(--forge-text-primary)",
          }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (connectionStatus === "connecting") {
    return (
      <div
        className="rounded-xl p-5 flex items-center justify-center"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        <span style={{ color: "var(--forge-text-muted)" }}>Connecting…</span>
      </div>
    );
  }

  // Connected
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-medium)",
      }}
    >
      {/* Address chip + disconnect */}
      <div className="flex items-center justify-between mb-4">
        <button
          aria-label={`Copy address ${address}`}
          onClick={handleCopyAddress}
          className="text-sm font-mono px-2 py-1 rounded"
          style={{
            color: "var(--forge-color-accent)",
            background: "rgba(255,167,38,0.1)",
          }}
          title={address ?? ""}
        >
          {copied ? "Copied!" : truncateAddress(address ?? "")}
        </button>
        <button
          onClick={onDisconnect}
          className="text-xs opacity-60 hover:opacity-100"
          style={{ color: "var(--forge-text-muted)" }}
        >
          Disconnect
        </button>
      </div>

      {/* Balances */}
      <div className="flex flex-col gap-2">
        {visibleBalances.map((b) => (
          <div key={b.contractHash} className="flex justify-between text-sm">
            <span style={{ color: "var(--forge-text-muted)" }}>{b.symbol}</span>
            <span style={{ color: "var(--forge-text-primary)" }}>
              {b.displayAmount}
            </span>
          </div>
        ))}
        {hiddenCount > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-left mt-1"
            style={{ color: "var(--forge-color-primary)" }}
          >
            +{hiddenCount} more…
          </button>
        )}
      </div>
    </div>
  );
}
