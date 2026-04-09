"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { LaunchDisclosureCard } from "@/modules/forge/components/LaunchDisclosureCard";
import { GraduationProgressCard } from "@/modules/forge/components/GraduationProgressCard";
import { PairChartPanel } from "@/modules/forge/components/PairChartPanel";
import { PairDataTabs } from "@/modules/forge/components/PairDataTabs";
import { PairHeaderHero } from "@/modules/forge/components/PairHeaderHero";
import { PostLaunchBanner } from "@/modules/forge/components/PostLaunchBanner";
import { TradeRail } from "@/modules/forge/components/TradeRail";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { usePendingTx } from "@/modules/forge/components/PendingTxProvider";
import { useMarketPair } from "@/modules/forge/hooks/useMarketPair";
import { useWallet } from "@/modules/forge/hooks/useWallet";

function PairPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div
        role="status"
        aria-label="Loading market"
        className="h-64 animate-pulse rounded-[28px]"
        style={{ background: "rgba(255,255,255,0.04)" }}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="space-y-6">
          <div
            className="h-[420px] animate-pulse rounded-[28px]"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
          <div
            className="h-56 animate-pulse rounded-[28px]"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
        </div>
        <div
          className="h-[320px] animate-pulse rounded-[28px]"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />
      </div>
    </div>
  );
}

export default function MarketPairPage() {
  const { hash } = useParams<{ hash: string }>();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const { pair, capabilities, loading, error } = useMarketPair(hash);
  const { address, gasBalance, connectionStatus, errorMessage, installedWallets, connect } = useWallet();
  const { setPendingTx } = usePendingTx();

  function handleTxSubmitted(txHash: string, message: string) {
    setPendingTx({
      txHash,
      message,
      targetTokenHash: hash,
    });
  }

  return (
    <>
      <ForgeHeader onConnectClick={() => setShowConnectModal(true)} />

      <main
        className="min-h-screen px-6 py-6"
        style={{ background: "var(--forge-bg-primary)" }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {loading ? (
            <PairPageSkeleton />
          ) : error ? (
            <section
              role="alert"
              className="rounded-[28px] px-6 py-8"
              style={{
                background: "rgba(255,82,82,0.08)",
                border: "1px solid rgba(255,82,82,0.24)",
                color: "var(--forge-error)",
              }}
            >
              <h1 className="text-2xl font-semibold">Market data unavailable</h1>
              <p className="mt-3 text-sm">{error}</p>
            </section>
          ) : pair ? (
            <>
              <PostLaunchBanner
                tokenHash={pair.tokenHash}
                decimals={pair.token.decimals}
              />
              <PairHeaderHero pair={pair} />

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
                <div className="space-y-6">
                  <PairChartPanel
                    pairLabel={pair.pairLabel}
                    candlesEnabled={capabilities.candles}
                  />
                  <PairDataTabs capabilities={capabilities} />
                  <LaunchDisclosureCard pair={pair} />
                </div>

                <div className="space-y-6">
                  <TradeRail
                    pair={pair}
                    connectedAddress={address}
                    connectionStatus={connectionStatus}
                    gasBalance={gasBalance}
                    onConnectClick={() => setShowConnectModal(true)}
                    onTxSubmitted={handleTxSubmitted}
                  />
                  <GraduationProgressCard pair={pair} />
                </div>
              </div>
            </>
          ) : (
            <section
              className="rounded-[28px] px-6 py-8"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--forge-border-subtle)",
              }}
            >
              <h1
                className="text-2xl font-semibold"
                style={{ color: "var(--forge-text-primary)" }}
              >
                Market not found
              </h1>
              <p className="mt-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                This pair is not available yet or has not entered speculation mode.
              </p>
            </section>
          )}
        </div>
      </main>

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
