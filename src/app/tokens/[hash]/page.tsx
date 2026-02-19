"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { TokenDetail } from "@/modules/forge/components/TokenDetail";
import { UpdateOverlay } from "@/modules/forge/components/UpdateOverlay";
import { WaitingOverlay } from "@/modules/forge/components/WaitingOverlay";
import {
  ForgeSuccessToast,
  ForgeErrorToast,
} from "@/modules/forge/components/ForgeToaster";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import { useTokenPolling } from "@/modules/forge/hooks/useTokenPolling";
import { useTokenDetail } from "@/modules/forge/hooks/useTokenDetail";

type PageView =
  | "detail"
  | "update-overlay"
  | "waiting-for-tx"
  | "show-success-toaster"
  | "show-error-toaster";

export default function TokenDetailPage() {
  const { hash } = useParams<{ hash: string }>();

  const { connectionStatus, errorMessage, installedWallets, connect } =
    useWallet();

  const { token } = useTokenDetail(hash);

  const [view, setView] = useState<PageView>("detail");
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const polling = useTokenPolling(
    view === "waiting-for-tx" ? pendingTxHash : null
  );

  // React to TX polling result
  useEffect(() => {
    if (view !== "waiting-for-tx") return;
    if (polling.status === "confirmed") {
      queueMicrotask(() => setView("show-success-toaster"));
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
  }, [view, polling]);

  function handleTxSubmitted(txHash: string) {
    setPendingTxHash(txHash);
    setView("waiting-for-tx");
  }

  return (
    <>
      <ForgeHeader onConnectClick={() => setShowConnectModal(true)} />

      <main
        className="min-h-screen"
        style={{ background: "var(--forge-bg-primary)" }}
      >
        <TokenDetail
          contractHash={hash}
          onUpdateClick={() => setView("update-overlay")}
        />
      </main>

      {view === "update-overlay" && token && (
        <UpdateOverlay
          token={token}
          onTxSubmitted={handleTxSubmitted}
          onClose={() => setView("detail")}
        />
      )}

      {view === "waiting-for-tx" && pendingTxHash && (
        <WaitingOverlay
          txHash={pendingTxHash}
          message="Updating your token…"
        />
      )}

      {view === "show-success-toaster" && token && (
        <ForgeSuccessToast
          symbol={token.symbol}
          onViewToken={() => setView("detail")}
          onDismiss={() => setView("detail")}
        />
      )}

      {view === "show-error-toaster" && (
        <ForgeErrorToast
          message={toastError ?? "Transaction failed."}
          txHash={pendingTxHash ?? undefined}
          onDismiss={() => setView("detail")}
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
