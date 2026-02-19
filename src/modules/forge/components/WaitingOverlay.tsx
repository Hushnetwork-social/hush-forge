"use client";

import { NEOTUBE_BASE_URL } from "../forge-config";

interface Props {
  txHash: string;
  message: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function WaitingOverlay({ txHash, message }: Props) {
  return (
    <div
      role="status"
      aria-label="Waiting for transaction"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 mx-4 text-center"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid rgba(255,107,53,0.3)",
        }}
      >
        <div className="text-5xl mb-5 animate-pulse" aria-hidden="true">
          🔥
        </div>
        <p
          className="text-lg font-semibold mb-3"
          style={{ color: "var(--forge-text-primary)" }}
        >
          {message}
        </p>
        <p
          className="text-xs mb-4"
          style={{ color: "var(--forge-text-muted)" }}
        >
          Do not close this window
        </p>
        <a
          href={`${NEOTUBE_BASE_URL}/transaction/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs"
          style={{ color: "var(--forge-color-primary)" }}
        >
          {truncateHash(txHash)} ↗
        </a>
      </div>
    </div>
  );
}
