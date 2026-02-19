"use client";

import { useShallow } from "zustand/react/shallow";
import { useTokenStore, selectDisplayTokens } from "../token-store";
import type { TokenInfo } from "../types";
import { TokenCard } from "./TokenCard";

interface Props {
  walletAddress: string | null;
  onTokenClick: (contractHash: string) => void;
}

function SkeletonCard() {
  return (
    <div
      role="status"
      aria-label="Loading token"
      className="rounded-xl p-4 h-36 animate-pulse"
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    />
  );
}

function FilterBar({
  filterMyTokens,
  onToggle,
}: {
  filterMyTokens: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center gap-2 text-sm cursor-pointer"
      style={{ color: "var(--forge-text-muted)" }}
    >
      <input
        type="checkbox"
        checked={filterMyTokens}
        onChange={(e) => onToggle(e.target.checked)}
      />
      My tokens only
    </label>
  );
}

export function TokenGrid({ walletAddress, onTokenClick }: Props) {
  const loadingStatus = useTokenStore((s) => s.loadingStatus);
  const filterMyTokens = useTokenStore((s) => s.filterMyTokens);
  const setFilterMyTokens = useTokenStore((s) => s.setFilterMyTokens);
  const ownTokenHashes = useTokenStore((s) => s.ownTokenHashes);
  const displayTokens = useTokenStore(useShallow(selectDisplayTokens));

  if (loadingStatus === "loading") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!walletAddress && displayTokens.length === 0) {
    return (
      <div
        className="text-center py-12"
        style={{ color: "var(--forge-text-muted)" }}
      >
        Connect your wallet to see tokens
      </div>
    );
  }

  if (filterMyTokens && displayTokens.length === 0) {
    return (
      <div>
        <FilterBar filterMyTokens={filterMyTokens} onToggle={setFilterMyTokens} />
        <div
          className="text-center py-12"
          style={{ color: "var(--forge-text-muted)" }}
        >
          You haven&apos;t forged any tokens yet. Click FORGE to start.
        </div>
      </div>
    );
  }

  return (
    <div>
      <FilterBar filterMyTokens={filterMyTokens} onToggle={setFilterMyTokens} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {displayTokens.map((token: TokenInfo) => (
          <TokenCard
            key={token.contractHash}
            token={token}
            isOwn={ownTokenHashes.has(token.contractHash)}
            isUpgradeable={false}
            onClick={onTokenClick}
          />
        ))}
      </div>
    </div>
  );
}
