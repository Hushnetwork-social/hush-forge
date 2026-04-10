"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { MarketShellLayout } from "@/modules/forge/components/MarketShellLayout";
import { PairsTable } from "@/modules/forge/components/PairsTable";
import { TrendingMarketsStrip } from "@/modules/forge/components/TrendingMarketsStrip";
import { useMarketPairs } from "@/modules/forge/hooks/useMarketPairs";
import { useWallet } from "@/modules/forge/hooks/useWallet";

const FILTER_CHIPS = [
  "Latest Pairs",
  "GAS",
  "NEO",
  "Graduation Soon",
  "Indexer Rankings Later",
] as const;

interface Props {
  initialSearch: string;
}

export function MarketsPageClient({ initialSearch }: Props) {
  const router = useRouter();
  const {
    connectionStatus,
    errorMessage,
    installedWallets,
    connect,
  } = useWallet();

  const { pairs, trendingPairs, loading, error } = useMarketPairs(initialSearch);

  const [searchValue, setSearchValue] = useState(initialSearch);
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    setSearchValue(initialSearch);
  }, [initialSearch]);

  function handleSearchChange(nextValue: string) {
    setSearchValue(nextValue);
    const trimmed = nextValue.trim();
    const params = new URLSearchParams();

    if (trimmed) {
      params.set("search", trimmed);
    }

    const query = params.toString();
    router.replace(query ? `/markets?${query}` : "/markets");
  }

  return (
    <>
      <MarketShellLayout onConnectClick={() => setShowConnectModal(true)}>
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            {FILTER_CHIPS.map((label, index) => {
              const isActive = index === 0;

              return (
                <button
                  key={label}
                  type="button"
                  className="rounded-full px-3 py-1.5 text-sm font-medium transition-all"
                  style={{
                    background: isActive
                      ? "var(--forge-color-primary)"
                      : "var(--forge-bg-card)",
                    color: isActive
                      ? "var(--forge-text-primary)"
                      : "var(--forge-text-muted)",
                    border: `1px solid ${
                      isActive
                        ? "var(--forge-color-primary)"
                        : "var(--forge-border-subtle)"
                    }`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="relative min-w-0 flex-1 sm:w-[320px] sm:flex-none">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: "var(--forge-text-muted)" }}
              aria-hidden="true"
            >
              {"\uD83D\uDD0D"}
            </span>
            <input
              type="search"
              aria-label="Search markets"
              placeholder="Name, symbol, address..."
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              className="w-full rounded-full py-1.5 pl-8 pr-3 text-sm outline-none"
              style={{
                background: "var(--forge-bg-card)",
                border: "1px solid var(--forge-border-subtle)",
                color: "var(--forge-text-primary)",
              }}
            />
          </div>
        </section>

        <TrendingMarketsStrip items={trendingPairs} loading={loading} />
        <PairsTable items={pairs} loading={loading} error={error} />
      </MarketShellLayout>

      {showConnectModal && (
        <WalletConnectModal
          installedWallets={installedWallets}
          connecting={connectionStatus === "connecting"}
          error={errorMessage}
          onConnect={(walletType) => {
            void connect(walletType);
            setShowConnectModal(false);
          }}
          onClose={() => setShowConnectModal(false)}
        />
      )}
    </>
  );
}
