"use client";

import { useShallow } from "zustand/react/shallow";
import { useTokenStore, selectDisplayTokens } from "../token-store";
import type { TabType } from "../token-store";
import type { TokenInfo } from "../types";
import { TokenCard } from "./TokenCard";

interface Props {
  walletAddress: string | null;
  onTokenClick: (contractHash: string) => void;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

const TABS: { id: TabType; label: string }[] = [
  { id: "all",        label: "All"         },
  { id: "mine",       label: "My Tokens"   },
  { id: "new",        label: "New"         },
  { id: "community",  label: "Community"   },
  { id: "speculative",label: "Speculative" },
  { id: "crowdfund",  label: "Crowdfunding"},
];

function TabBar({
  active,
  onSelect,
}: {
  active: TabType;
  onSelect: (tab: TabType) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 flex-wrap"
      role="tablist"
      aria-label="Token filter"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: isActive
                ? "var(--forge-color-primary)"
                : "var(--forge-bg-card)",
              color: isActive
                ? "var(--forge-text-primary)"
                : "var(--forge-text-muted)",
              border: `1px solid ${isActive ? "var(--forge-color-primary)" : "var(--forge-border-subtle)"}`,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 min-w-0" style={{ maxWidth: 280 }}>
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
        style={{ color: "var(--forge-text-muted)" }}
        aria-hidden="true"
      >
        🔍
      </span>
      <input
        type="text"
        aria-label="Search tokens"
        placeholder="Name, symbol, address…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full py-1.5 pl-8 pr-3 text-sm outline-none"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-subtle)",
          color: "var(--forge-text-primary)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TokenGrid({ walletAddress, onTokenClick }: Props) {
  const loadingStatus  = useTokenStore((s) => s.loadingStatus);
  const activeTab      = useTokenStore((s) => s.activeTab);
  const searchQuery    = useTokenStore((s) => s.searchQuery);
  const setActiveTab   = useTokenStore((s) => s.setActiveTab);
  const setSearchQuery = useTokenStore((s) => s.setSearchQuery);
  const ownTokenHashes = useTokenStore((s) => s.ownTokenHashes);
  const displayTokens  = useTokenStore(useShallow(selectDisplayTokens));

  if (loadingStatus === "loading") {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <TabBar active={activeTab} onSelect={setActiveTab} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
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

  const emptyMessage =
    activeTab === "mine"
      ? walletAddress
        ? "You haven't forged any tokens yet. Click 🔥 Forge Token to start."
        : "Connect your wallet to see your tokens."
      : activeTab === "new"
      ? searchQuery.trim()
        ? "No new tokens match your search."
        : "No Forge tokens yet — be the first to launch one!"
      : searchQuery.trim()
      ? "No tokens match your search."
      : `No ${activeTab === "all" ? "" : activeTab + " "}tokens found.`;

  return (
    <div>
      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <TabBar active={activeTab} onSelect={setActiveTab} />
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {displayTokens.length === 0 ? (
        <div
          className="text-center py-12"
          style={{ color: "var(--forge-text-muted)" }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayTokens.map((token: TokenInfo) => (
            <TokenCard
              key={token.contractHash}
              token={token}
              isOwn={ownTokenHashes.has(token.contractHash)}
              onClick={onTokenClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
