"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { SpeculationActivationSheet } from "@/modules/forge/components/SpeculationActivationSheet";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { usePendingTx } from "@/modules/forge/components/PendingTxProvider";
import { getRuntimeFactoryHash } from "@/modules/forge/forge-config";
import { useTokenDetail } from "@/modules/forge/hooks/useTokenDetail";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import type { PendingTxSubmissionOptions } from "@/modules/forge/types";

function LaunchPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading launch review"
      className="h-[620px] animate-pulse rounded-[28px]"
      style={{ background: "rgba(255,255,255,0.04)" }}
    />
  );
}

function LaunchUnavailable({
  title,
  message,
  backHref,
}: {
  title: string;
  message: string;
  backHref: string;
}) {
  return (
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
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
        {message}
      </p>
      <Link
        href={backHref}
        className="mt-5 inline-flex rounded-full px-4 py-2 text-sm font-semibold"
        style={{
          border: "1px solid var(--forge-border-medium)",
          color: "var(--forge-text-primary)",
        }}
      >
        Back to Token
      </Link>
    </section>
  );
}

export default function TokenLaunchPage() {
  const { hash } = useParams<{ hash: string }>();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const { setPendingTx, pendingTx, pendingStatus } = usePendingTx();
  const { token, loading, error, isOwnToken, isUpgradeable } = useTokenDetail(hash);
  const {
    address,
    connectionStatus,
    errorMessage,
    installedWallets,
    connect,
  } = useWallet();

  const factoryHash = getRuntimeFactoryHash();
  const backHref = `/tokens/${hash}`;
  const launchPendingMessage =
    pendingTx?.targetTokenHash === hash &&
    pendingTx.redirectPath === `/markets/${hash}` &&
    (pendingStatus === "pending" || pendingStatus === "confirming")
      ? "Forge is registering this token on the bonding curve and preparing the public market. The trading page will open automatically after confirmation."
      : null;

  function handleTxSubmitted(
    txHash: string,
    message: string,
    options?: PendingTxSubmissionOptions
  ) {
    setPendingTx({
      txHash,
      message,
      targetTokenHash: options?.targetTokenHash ?? hash,
      redirectPath: options?.redirectPath,
      marketLaunchSummary: options?.marketLaunchSummary,
    });
  }

  const launchUnavailable =
    token &&
    (token.mode !== "community" || !isUpgradeable || (token.locked ?? false));
  const unauthorized = Boolean(address && token && !isOwnToken);

  return (
    <>
      <ForgeHeader onConnectClick={() => setShowConnectModal(true)} />

      <main
        className="min-h-screen px-6 py-6"
        style={{ background: "var(--forge-bg-primary)" }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {loading ? (
            <LaunchPageSkeleton />
          ) : error ? (
            <LaunchUnavailable
              title="Launch review unavailable"
              message={error}
              backHref={backHref}
            />
          ) : !token ? (
            <LaunchUnavailable
              title="Token not found"
              message="This token could not be loaded for speculation launch review."
              backHref={backHref}
            />
          ) : unauthorized ? (
            <LaunchUnavailable
              title="Owner wallet required"
              message="Only the token creator can launch this market into speculation."
              backHref={backHref}
            />
          ) : launchUnavailable ? (
            <LaunchUnavailable
              title="Launch not available"
              message="This token is no longer in Community mode or cannot be moved into speculation from here."
              backHref={backHref}
            />
          ) : (
            <SpeculationActivationSheet
              token={token}
              factoryHash={factoryHash}
              onTxSubmitted={handleTxSubmitted}
              layout="page"
              backHref={backHref}
              pendingMessage={launchPendingMessage}
            />
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
