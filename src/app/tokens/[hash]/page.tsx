"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { TokenDetail } from "@/modules/forge/components/TokenDetail";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import { usePendingTx } from "@/modules/forge/components/PendingTxProvider";

export default function TokenDetailPage() {
  const { hash } = useParams<{ hash: string }>();

  const { connectionStatus, errorMessage, installedWallets, connect } =
    useWallet();
  const { setPendingTx } = usePendingTx();

  const [showConnectModal, setShowConnectModal] = useState(false);

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
        className="min-h-screen"
        style={{ background: "var(--forge-bg-primary)" }}
      >
        <TokenDetail contractHash={hash} onTxSubmitted={handleTxSubmitted} />
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
