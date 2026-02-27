"use client";

import { useState } from "react";
import type { TokenInfo } from "../types";
import { TokenIcon } from "./TokenIcon";
import { BurnBadge } from "./BurnBadge";
import { LockBadge } from "./LockBadge";

interface Props {
  token: TokenInfo;
  isOwn: boolean;
  onClick: (contractHash: string) => void;
}

function truncateHash(hash: string): string {
  if (hash.length <= 10) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatSupply(supply: bigint, decimals: number): string {
  if (supply === 0n) return "-";
  const factor = 10n ** BigInt(decimals);
  const whole = supply / factor;
  if (whole === 0n && decimals > 0) {
    const frac = (supply % factor).toString().padStart(decimals, "0").replace(/0+$/, "");
    return `0.${frac}`;
  }
  return whole.toLocaleString();
}

const NEW_THRESHOLD_SECS = 86_400;

function isNewToken(createdAt: number | null, isNative: boolean): boolean {
  if (isNative || createdAt === null) return false;
  return Date.now() / 1000 - createdAt < NEW_THRESHOLD_SECS;
}

function TypeBadge({ isNative }: { isNative: boolean }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{
        background: isNative ? "rgba(0,229,153,0.15)" : "rgba(255,107,53,0.15)",
        color: isNative ? "#00e599" : "var(--forge-color-primary)",
      }}
    >
      {isNative ? "Native" : "NEP-17"}
    </span>
  );
}

const MODE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  community: { label: "Community", color: "#00c8d8", bg: "rgba(0,180,200,0.15)" },
  crowdfund: { label: "Crowdfund", color: "#00c050", bg: "rgba(0,180,80,0.15)" },
  speculative: { label: "Speculative", color: "#ff9600", bg: "rgba(255,140,0,0.15)" },
};

function ModeBadge({ mode }: { mode: string }) {
  const cfg = MODE_CONFIG[mode.toLowerCase()];
  if (!cfg) return null;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

export function TokenCard({ token, isOwn, onClick }: Props) {
  const [copied, setCopied] = useState(false);
  const isNew = isNewToken(token.createdAt ?? null, token.isNative ?? false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(token.contractHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const displayName = token.name && token.name !== token.symbol ? token.name : null;

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
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <TokenIcon contractHash={token.contractHash} size={36} imageUrl={token.imageUrl} />
          <span className="text-xl font-bold truncate" style={{ color: "var(--forge-text-primary)" }}>
            {token.symbol}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <TypeBadge isNative={token.isNative ?? false} />
          {isNew && (
            <span aria-label="New token" className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(0,200,120,0.18)", color: "#00c878", fontSize: "10px", fontWeight: 700 }}>
              NEW
            </span>
          )}
          {isOwn && (
            <span aria-label="Your token" className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,107,53,0.2)", color: "var(--forge-color-primary)", fontSize: "10px", fontWeight: 600 }}>
              Yours
            </span>
          )}
        </div>
      </div>

      <p className="text-sm mb-2" style={{ color: "var(--forge-text-muted)", minHeight: "1.25rem", paddingLeft: "44px" }}>
        {displayName ?? ""}
      </p>

      <div className="flex flex-wrap gap-2 mb-2" style={{ paddingLeft: "44px" }}>
        <BurnBadge burnRate={token.burnRate ?? 0} />
        <LockBadge locked={token.locked ?? false} />
      </div>

      <p className="text-xs mb-2" style={{ color: "var(--forge-text-muted)" }}>
        Supply {formatSupply(token.supply, token.decimals)}
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-mono truncate" style={{ color: "var(--forge-text-muted)" }}>
            {truncateHash(token.contractHash)}
          </span>
          <button
            aria-label="Copy contract address"
            onClick={handleCopy}
            className="text-xs px-1 rounded transition-opacity hover:opacity-80 flex-shrink-0"
            style={{ color: "var(--forge-text-muted)", lineHeight: 1 }}
          >
            {copied ? "OK" : "COPY"}
          </button>
        </div>
        {token.mode && <ModeBadge mode={token.mode} />}
      </div>
    </article>
  );
}