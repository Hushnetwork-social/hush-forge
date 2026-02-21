"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { WalletPanel } from "@/modules/forge/components/WalletPanel";
import { TokenGrid } from "@/modules/forge/components/TokenGrid";
import { ForgeOverlay } from "@/modules/forge/components/ForgeOverlay";
import { WaitingOverlay } from "@/modules/forge/components/WaitingOverlay";
import { ForgeErrorToast } from "@/modules/forge/components/ForgeToaster";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useFactoryDeployment } from "@/modules/forge/hooks/useFactoryDeployment";
import { useTokenPolling } from "@/modules/forge/hooks/useTokenPolling";
import { useTokenStore } from "@/modules/forge/token-store";
import { FactoryDeployBanner } from "@/modules/forge/components/FactoryDeployBanner";

type PageView =
  | "dashboard"
  | "forge-overlay"
  | "waiting-for-tx"
  | "show-error-toaster";

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
  } = useWallet();

  const factory = useFactoryDeployment(address);

  const loadTokensForAddress = useTokenStore((s) => s.loadTokensForAddress);
  const loadWalletHeldTokens = useTokenStore((s) => s.loadWalletHeldTokens);

  const [view, setView] = useState<PageView>("dashboard");
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const polling = useTokenPolling(
    view === "waiting-for-tx" ? pendingTxHash : null
  );

  // Load tokens created by this address when wallet connects
  useEffect(() => {
    if (address && connectionStatus === "connected") {
      void loadTokensForAddress(address);
    }
  }, [address, connectionStatus, loadTokensForAddress]);

  // Enrich token list with wallet-held tokens after balances load
  useEffect(() => {
    if (balances.length > 0) {
      void loadWalletHeldTokens(balances);
    }
  }, [balances, loadWalletHeldTokens]);

  // React to TX polling result
  useEffect(() => {
    if (view !== "waiting-for-tx") return;
    if (polling.status === "confirmed" && polling.contractHash) {
      router.push(`/tokens/${polling.contractHash}`);
    } else if (
      polling.status === "faulted" ||
      polling.status === "timeout"
    ) {
      const err = polling.error ?? "Transaction failed.";
      queueMicrotask(() => {
        setToastError(err);
        setView("show-error-toaster");
      });
    }
  }, [view, polling, router]);

  function handleTxSubmitted(txHash: string) {
    setPendingTxHash(txHash);
    setView("waiting-for-tx");
  }

  return (
    <>
      <ForgeHeader onConnectClick={() => setShowConnectModal(true)} />

      <main
        className="min-h-screen p-6"
        style={{ background: "var(--forge-bg-primary)" }}
      >
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          <WalletPanel
            connectionStatus={connectionStatus}
            address={address}
            balances={balances}
            errorMessage={errorMessage}
            onConnectClick={() => setShowConnectModal(true)}
            onDisconnect={disconnect}
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
                🔥 Forge Token
              </button>
            </div>
          )}

          <TokenGrid
            walletAddress={address}
            onTokenClick={(hash) => router.push(`/tokens/${hash}`)}
          />
        </div>
      </main>

      {view === "forge-overlay" && (
        <ForgeOverlay
          address={address}
          gasBalance={gasBalance}
          onTxSubmitted={handleTxSubmitted}
          onClose={() => setView("dashboard")}
        />
      )}

      {view === "waiting-for-tx" && pendingTxHash && (
        <WaitingOverlay
          txHash={pendingTxHash}
          message="Forging your token…"
        />
      )}

      {view === "show-error-toaster" && (
        <ForgeErrorToast
          message={toastError ?? "Transaction failed."}
          txHash={pendingTxHash ?? undefined}
          onDismiss={() => setView("dashboard")}
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
