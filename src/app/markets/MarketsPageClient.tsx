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

  function handleSearchSubmit() {
    const trimmed = searchValue.trim();
    const params = new URLSearchParams();

    if (trimmed) {
      params.set("search", trimmed);
    }

    const query = params.toString();
    router.push(query ? `/markets?${query}` : "/markets");
  }

  return (
    <>
      <MarketShellLayout
        onConnectClick={() => setShowConnectModal(true)}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={handleSearchSubmit}
      >
        <section className="flex flex-wrap items-center gap-2">
          {FILTER_CHIPS.map((label, index) => {
            const isActive = index === 0;

            return (
              <button
                key={label}
                type="button"
                className="rounded-full px-4 py-2 text-sm font-medium"
                style={{
                  background: isActive
                    ? "rgba(255,107,53,0.14)"
                    : "rgba(255,255,255,0.04)",
                  color: isActive
                    ? "var(--forge-color-primary)"
                    : "var(--forge-text-muted)",
                  border: `1px solid ${
                    isActive
                      ? "rgba(255,107,53,0.3)"
                      : "var(--forge-border-subtle)"
                  }`,
                }}
              >
                {label}
              </button>
            );
          })}
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
