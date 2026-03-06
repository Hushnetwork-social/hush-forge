"use client";

import Link from "next/link";
import { useFactoryAdminAccess } from "@/modules/forge/hooks/useFactoryAdminAccess";
import { useWalletStore } from "@/modules/forge/wallet-store";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface Props {
  onConnectClick: () => void;
}

function LogoutIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function ForgeHeader({ onConnectClick }: Props) {
  const address = useWalletStore((s) => s.address);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  const disconnect = useWalletStore((s) => s.disconnect);
  const adminAccess = useFactoryAdminAccess(address);

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

      <div className="flex items-center gap-2">
        {address ? (
          <>
            {adminAccess.access.navVisible && (
              <Link
                href="/admin/factory"
                className="rounded px-3 py-1 text-sm font-semibold"
                style={{
                  color: "var(--forge-color-primary)",
                  border: "1px solid var(--forge-border-medium)",
                }}
              >
                Admin
              </Link>
            )}
            <span
              className="text-sm font-mono px-3 py-1 rounded"
              style={{
                color: "var(--forge-color-accent)",
                background: "rgba(255,167,38,0.1)",
              }}
            >
              {truncateAddress(address)}
            </span>
            <button
              onClick={disconnect}
              aria-label="Disconnect wallet"
              title="Disconnect wallet"
              className="p-1.5 rounded opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: "var(--forge-text-muted)" }}
            >
              <LogoutIcon />
            </button>
          </>
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
