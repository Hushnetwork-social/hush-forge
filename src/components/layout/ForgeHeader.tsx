"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useWalletStore } from "@/modules/forge/wallet-store";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface Props {
  onConnectClick: () => void;
  homeHref?: string;
  children?: ReactNode;
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

export function ForgeHeader({
  onConnectClick,
  homeHref = "/markets",
  children,
}: Props) {
  const address = useWalletStore((s) => s.address);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  const disconnect = useWalletStore((s) => s.disconnect);

  return (
    <header
      className="w-full px-6 py-3"
      style={{
        background: "var(--forge-bg-card)",
        borderBottom: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href={homeHref}
            className="shrink-0 text-xl font-bold tracking-wide"
            style={{ color: "var(--forge-color-primary)" }}
          >
            Forge
          </Link>

          {children ? <div className="flex min-w-0 flex-wrap items-center">{children}</div> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {address ? (
            <>
              <span
                className="rounded px-3 py-1 font-mono text-sm"
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
                className="rounded p-1.5 opacity-50 transition-opacity hover:opacity-100"
                style={{ color: "var(--forge-text-muted)" }}
              >
                <LogoutIcon />
              </button>
            </>
          ) : (
            <button
              onClick={onConnectClick}
              disabled={connectionStatus === "connecting"}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{
                background: "var(--forge-color-primary)",
                color: "var(--forge-text-primary)",
              }}
            >
              {connectionStatus === "connecting" ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
