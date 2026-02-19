"use client";

import type { TokenInfo } from "../types";

interface Props {
  token: TokenInfo;
  isOwn: boolean;
  isUpgradeable: boolean;
  onClick: (contractHash: string) => void;
}

function truncateHash(hash: string): string {
  if (hash.length <= 10) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatSupply(supply: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  return (supply / factor).toLocaleString();
}

export function TokenCard({ token, isOwn, isUpgradeable, onClick }: Props) {
  return (
    <article
      role="article"
      onClick={() => onClick(token.contractHash)}
      className="rounded-xl p-4 cursor-pointer transition-transform hover:-translate-y-1"
      style={{
        background: "var(--forge-bg-card)",
        border: `1px solid ${isOwn ? "var(--forge-border-own)" : "var(--forge-border-subtle)"}`,
      }}
    >
      {/* Symbol row + badges */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOwn && (
            <span
              aria-label="Your token"
              style={{ color: "var(--forge-color-accent)" }}
            >
              ★
            </span>
          )}
          <span
            className="text-xl font-bold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {token.symbol}
          </span>
        </div>
        {isOwn && (
          <span
            aria-label={isUpgradeable ? "Upgradeable" : "Not upgradeable"}
          >
            {isUpgradeable ? "🔓" : "🔒"}
          </span>
        )}
      </div>

      {/* Name */}
      <p
        className="text-sm truncate mb-2"
        style={{ color: "var(--forge-text-muted)" }}
      >
        {token.name}
      </p>

      {/* Supply */}
      <p className="text-xs mb-1" style={{ color: "var(--forge-text-muted)" }}>
        Supply {formatSupply(token.supply, token.decimals)}
      </p>

      {/* Mode */}
      {token.mode && (
        <p className="text-xs mb-1" style={{ color: "var(--forge-text-muted)" }}>
          {token.mode}
        </p>
      )}

      {/* Creator */}
      {token.creator && (
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          {truncateHash(token.creator)}
        </p>
      )}
    </article>
  );
}
