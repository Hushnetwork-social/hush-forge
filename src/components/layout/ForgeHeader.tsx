"use client";

import Link from "next/link";
import { useWalletStore } from "@/modules/forge/wallet-store";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface Props {
  onConnectClick: () => void;
}

export function ForgeHeader({ onConnectClick }: Props) {
  const address = useWalletStore((s) => s.address);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);

  return (
    <header
      className="w-full px-6 py-4 flex items-center justify-between"
      style={{
        background: "var(--forge-bg-card)",
        borderBottom: "1px solid var(--forge-border-subtle)",
      }}
    >
      <Link
        href="/tokens"
        className="text-xl font-bold tracking-wide"
        style={{ color: "var(--forge-color-primary)" }}
      >
        Forge
      </Link>

      <div className="flex items-center gap-3">
        {address ? (
          <span
            className="text-sm font-mono px-3 py-1 rounded"
            style={{
              color: "var(--forge-color-accent)",
              background: "rgba(255,167,38,0.1)",
            }}
          >
            {truncateAddress(address)}
          </span>
        ) : (
          <button
            onClick={onConnectClick}
            disabled={connectionStatus === "connecting"}
            className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            style={{
              background: "var(--forge-color-primary)",
              color: "var(--forge-text-primary)",
            }}
          >
            {connectionStatus === "connecting" ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
