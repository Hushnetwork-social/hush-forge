"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletPanel } from "@/modules/forge/components/WalletPanel";
import { TokenGrid } from "@/modules/forge/components/TokenGrid";
import { ForgeOverlay } from "@/modules/forge/components/ForgeOverlay";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useFactoryDeployment } from "@/modules/forge/hooks/useFactoryDeployment";
import { useTokenStore } from "@/modules/forge/token-store";
import { FactoryDeployBanner } from "@/modules/forge/components/FactoryDeployBanner";
import { usePendingTx } from "@/modules/forge/components/PendingTxProvider";
import { MarketShellLayout } from "@/modules/forge/components/MarketShellLayout";

type PageView = "dashboard" | "forge-overlay";

export default function TokensPage() {
  const router = useRouter();
  const {
    address,
    balances,
    connectionStatus,
    errorMessage,
    installedWallets,
    gasBalance,
    connect,
    disconnect,
    refreshBalances,
  } = useWallet();

  const factory = useFactoryDeployment(address);
  const { setPendingTx } = usePendingTx();

  const loadTokensForAddress = useTokenStore((s) => s.loadTokensForAddress);
  const loadWalletHeldTokens = useTokenStore((s) => s.loadWalletHeldTokens);

  const [view, setView] = useState<PageView>("dashboard");
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const previousFactoryStatusRef = useRef(factory.status);

  useEffect(() => {
    if (address && connectionStatus === "connected") {
      void loadTokensForAddress(address);
    }
  }, [address, connectionStatus, loadTokensForAddress]);

  useEffect(() => {
    if (balances.length > 0) {
      void loadWalletHeldTokens(balances);
    }
  }, [balances, loadWalletHeldTokens]);

  useEffect(() => {
    const previousStatus = previousFactoryStatusRef.current;
    previousFactoryStatusRef.current = factory.status;

    if (
      previousStatus !== factory.status &&
      factory.status === "deployed" &&
      address &&
      connectionStatus === "connected"
    ) {
      void refreshBalances();
      void loadTokensForAddress(address);
    }
  }, [
    address,
    connectionStatus,
    factory.status,
    loadTokensForAddress,
    refreshBalances,
  ]);

  function handleTxSubmitted(
    txHash: string,
    message = "Waiting for forge transaction confirmation..."
  ) {
    setPendingTx({
      txHash,
      message,
    });
    setView("dashboard");
  }

  function handleMarketSearchSubmit() {
    const params = new URLSearchParams();
    const trimmed = marketSearch.trim();
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
        searchValue={marketSearch}
        onSearchChange={setMarketSearch}
        onSearchSubmit={handleMarketSearchSubmit}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <WalletPanel
            connectionStatus={connectionStatus}
            address={address}
            balances={balances}
            errorMessage={errorMessage}
            onConnectClick={() => setShowConnectModal(true)}
            onDisconnect={disconnect}
            onTxSubmitted={handleTxSubmitted}
          />

          <FactoryDeployBanner
            status={factory.status}
            deployError={factory.deployError}
            onDeploy={() => void factory.deploy()}
            onInitialize={() => void factory.initialize()}
            onRecheck={factory.recheck}
          />

          {connectionStatus === "connected" && (
            <div className="flex justify-end">
              <button
                onClick={() => setView("forge-overlay")}
                disabled={factory.status !== "deployed"}
                title={
                  factory.status !== "deployed"
                    ? "Deploy and initialize TokenFactory first"
                    : undefined
                }
                className="px-6 py-3 rounded-lg font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background:
                    "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
                  color: "var(--forge-text-primary)",
                }}
              >
                Forge Token
              </button>
            </div>
          )}

          <TokenGrid
            walletAddress={address}
            onTokenClick={(hash) => router.push(`/tokens/${hash}`)}
          />
        </div>
      </MarketShellLayout>

      {view === "forge-overlay" && (
        <ForgeOverlay
          address={address}
          gasBalance={gasBalance}
          onTxSubmitted={handleTxSubmitted}
          onClose={() => setView("dashboard")}
        />
      )}

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
