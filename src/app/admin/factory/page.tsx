"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { MarketShellTabs } from "@/modules/forge/components/MarketShellTabs";
import {
  FactoryAdminDashboard,
  type AdminMutationState,
} from "@/modules/forge/components/FactoryAdminDashboard";
import { FactoryAdminSuccessToast } from "@/modules/forge/components/FactoryAdminToast";
import { ForgeErrorToast, ForgePendingToast } from "@/modules/forge/components/ForgeToaster";
import { WalletConnectModal } from "@/modules/forge/components/WalletConnectModal";
import { normalizeGovernanceError } from "@/modules/forge/factory-governance-logic";
import { fetchClaimableFactoryAssets } from "@/modules/forge/factory-governance-service";
import { pollForConfirmation } from "@/modules/forge/forge-service";
import { useFactoryAdminAccess } from "@/modules/forge/hooks/useFactoryAdminAccess";
import { useWallet } from "@/modules/forge/hooks/useWallet";
import {
  invokeClaim,
  invokeClaimAll,
  invokeSetAllTokensPlatformFee,
  invokeSetCreationFee,
  invokeSetOperationFee,
  invokeSetPaused,
  invokeUpgradeTemplate,
} from "@/modules/forge/neo-dapi-adapter";
import { hash160ToAddress } from "@/modules/forge/neo-rpc-client";
import type { ClaimableFactoryAsset } from "@/modules/forge/types";

type ToastState =
  | { kind: "pending"; message: string; txHash: string; status: "pending" | "confirming" }
  | { kind: "success"; message: string; txHash: string }
  | { kind: "error"; message: string; txHash?: string };

const IDLE_MUTATION: AdminMutationState = {
  phase: "idle",
  message: null,
  txHash: null,
  technicalDetails: null,
};

export default function FactoryAdminPage() {
  const {
    address,
    connectionStatus,
    errorMessage,
    installedWallets,
    connect,
  } = useWallet();
  const accessState = useFactoryAdminAccess(address);

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [assets, setAssets] = useState<ClaimableFactoryAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [activeMutationId, setActiveMutationId] = useState<string | null>(null);
  const [mutations, setMutations] = useState<Record<string, AdminMutationState>>({});
  const [toast, setToast] = useState<ToastState | null>(null);

  const factoryAddress = useMemo(() => {
    if (!accessState.factoryHash) return "";
    try {
      return hash160ToAddress(accessState.factoryHash);
    } catch {
      return "";
    }
  }, [accessState.factoryHash]);

  const ownerDisplay = useMemo(() => {
    if (!accessState.config) return "";
    try {
      return hash160ToAddress(accessState.config.owner);
    } catch {
      return accessState.config.owner;
    }
  }, [accessState.config]);

  const loadAssets = useCallback(async () => {
    if (!factoryAddress) {
      setAssetsError("Unable to resolve the TokenFactory address for claim discovery.");
      setAssets([]);
      return;
    }

    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const nextAssets = await fetchClaimableFactoryAssets(factoryAddress);
      setAssets(nextAssets);
    } catch (err) {
      setAssets([]);
      setAssetsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetsLoading(false);
    }
  }, [factoryAddress]);

  useEffect(() => {
    if (accessState.status === "ready" && accessState.access.routeAuthorized) {
      void loadAssets();
    }
  }, [accessState.access.routeAuthorized, accessState.status, loadAssets]);

  function setMutation(id: string, next: Partial<AdminMutationState>) {
    setMutations((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? IDLE_MUTATION),
        ...next,
      },
    }));
  }

  async function runMutation(
    mutationId: string,
    submit: () => Promise<string>,
    submittedMessage: string,
    successMessage: string
  ) {
    setActiveMutationId(mutationId);
    setMutation(mutationId, {
      phase: "submitting",
      message: "Awaiting wallet signature.",
      txHash: null,
      technicalDetails: null,
    });

    try {
      const txHash = await submit();
      setToast({
        kind: "pending",
        message: submittedMessage,
        txHash,
        status: "pending",
      });
      setMutation(mutationId, {
        phase: "pending",
        message: submittedMessage,
        txHash,
      });

      await pollForConfirmation(
        txHash,
        (status) => {
          if (status === "pending" || status === "confirming") {
            setToast({
              kind: "pending",
              message: submittedMessage,
              txHash,
              status,
            });
            setMutation(mutationId, { phase: status, message: submittedMessage, txHash });
          }
        },
        { timeoutMs: 0 }
      );

      accessState.reload();
      await loadAssets();

      setMutation(mutationId, {
        phase: "success",
        message: successMessage,
        txHash,
        technicalDetails: null,
      });
      setToast({ kind: "success", message: successMessage, txHash });
    } catch (err) {
      const normalized = normalizeGovernanceError(err);
      const txHash =
        mutations[mutationId]?.txHash ??
        (err && typeof err === "object" && "txHash" in err && typeof (err as { txHash?: unknown }).txHash === "string"
          ? (err as { txHash: string }).txHash
          : undefined);
      setMutation(mutationId, {
        phase: "error",
        message: normalized.message,
        technicalDetails: normalized.technicalDetails,
        txHash: txHash ?? null,
      });
      setToast({ kind: "error", message: normalized.message, txHash });
    } finally {
      setActiveMutationId(null);
    }
  }

  const connectModal = showConnectModal ? (
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
  ) : null;

  if (!address) {
    return (
      <>
        <ForgeHeader onConnectClick={() => setShowConnectModal(true)}>
          <MarketShellTabs />
        </ForgeHeader>
        <main className="min-h-screen px-6 py-10" style={{ background: "var(--forge-bg-primary)" }}>
          <div className="mx-auto max-w-3xl rounded-2xl p-8 text-center" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h1 className="text-3xl font-semibold">Connect Wallet Required</h1>
            <p className="mt-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              Connect the TokenFactory owner wallet to access this page.
            </p>
            <button
              onClick={() => setShowConnectModal(true)}
              className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
            >
              Connect Wallet
            </button>
          </div>
        </main>
        {connectModal}
      </>
    );
  }

  if (accessState.status === "loading") {
    return (
      <>
        <ForgeHeader onConnectClick={() => setShowConnectModal(true)}>
          <MarketShellTabs />
        </ForgeHeader>
        <main className="min-h-screen px-6 py-10" style={{ background: "var(--forge-bg-primary)" }}>
          <div className="mx-auto max-w-3xl rounded-2xl p-8 text-center" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h1 className="text-3xl font-semibold">Checking owner access...</h1>
          </div>
        </main>
      </>
    );
  }

  if (accessState.status === "error") {
    return (
      <>
        <ForgeHeader onConnectClick={() => setShowConnectModal(true)}>
          <MarketShellTabs />
        </ForgeHeader>
        <main className="min-h-screen px-6 py-10" style={{ background: "var(--forge-bg-primary)" }}>
          <div className="mx-auto max-w-3xl rounded-2xl p-8 text-center" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h1 className="text-3xl font-semibold">Unable to load TokenFactory configuration</h1>
            <p className="mt-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              We could not read the current contract settings.
            </p>
            {accessState.error && (
              <p className="mt-2 text-xs" style={{ color: "var(--forge-error)" }}>
                {accessState.error}
              </p>
            )}
            <button
              onClick={accessState.reload}
              className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
            >
              Retry
            </button>
          </div>
        </main>
      </>
    );
  }

  if (!accessState.access.routeAuthorized || !accessState.config) {
    return (
      <>
        <ForgeHeader onConnectClick={() => setShowConnectModal(true)}>
          <MarketShellTabs />
        </ForgeHeader>
        <main className="min-h-screen px-6 py-10" style={{ background: "var(--forge-bg-primary)" }}>
          <div className="mx-auto max-w-3xl rounded-2xl p-8 text-center" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}>
            <h1 className="text-3xl font-semibold">Unauthorized</h1>
            <p className="mt-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
              This page is restricted to the TokenFactory contract owner. Connect the owner wallet to continue.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <ForgeHeader onConnectClick={() => setShowConnectModal(true)}>
        <MarketShellTabs />
      </ForgeHeader>
      <FactoryAdminDashboard
        factoryHash={accessState.factoryHash}
        connectedAddress={address}
        ownerDisplay={ownerDisplay}
        config={accessState.config}
        assets={assets}
        assetsLoading={assetsLoading}
        assetsError={assetsError}
        activeMutationId={activeMutationId}
        mutations={mutations}
        onRetryAssets={() => void loadAssets()}
        onSetCreationFee={async (feeInDatoshi) => {
          await runMutation(
            "creation-fee",
            () => invokeSetCreationFee(accessState.factoryHash, feeInDatoshi),
            "Creation fee transaction submitted.",
            "Creation fee updated and config refreshed."
          );
        }}
        onSetOperationFee={async (feeInDatoshi) => {
          await runMutation(
            "operation-fee",
            () => invokeSetOperationFee(accessState.factoryHash, feeInDatoshi),
            "Operation fee transaction submitted.",
            "Operation fee updated and config refreshed."
          );
        }}
        onSetAllTokensPlatformFee={async (feeInDatoshi, offset, batchSize) => {
          await runMutation(
            "platform-fee-batch",
            () => invokeSetAllTokensPlatformFee(accessState.factoryHash, feeInDatoshi, offset, batchSize),
            `Platform fee batch transaction submitted (offset ${offset.toString()}, size ${batchSize.toString()}).`,
            "Platform fee default updated and selected token batch propagated."
          );
        }}
        onSetPaused={async (paused) => {
          await runMutation(
            "pause",
            () => invokeSetPaused(accessState.factoryHash, paused),
            paused ? "Pause transaction submitted." : "Unpause transaction submitted.",
            paused ? "Factory pause state updated." : "Factory unpaused."
          );
        }}
        onUpgradeTemplate={async (nefBase64, manifestText) => {
          await runMutation(
            "upgrade",
            () => invokeUpgradeTemplate(accessState.factoryHash, nefBase64, manifestText),
            "Template upgrade transaction submitted.",
            "Template upgrade confirmed and config refreshed."
          );
        }}
        onClaimAll={async (assetHash) => {
          await runMutation(
            `claim:${assetHash}`,
            () => invokeClaimAll(accessState.factoryHash, assetHash),
            "Claim-all transaction submitted.",
            "Claim-all confirmed and balances refreshed."
          );
        }}
        onClaim={async (assetHash, amountRaw) => {
          await runMutation(
            `claim:${assetHash}`,
            () => invokeClaim(accessState.factoryHash, assetHash, amountRaw),
            "Partial claim transaction submitted.",
            "Partial claim confirmed and balances refreshed."
          );
        }}
      />

      {connectModal}

      {toast?.kind === "pending" && (
        <ForgePendingToast
          message={toast.message}
          txHash={toast.txHash}
          status={toast.status}
          onDismiss={() => setToast(null)}
        />
      )}
      {toast?.kind === "success" && (
        <FactoryAdminSuccessToast
          message={toast.message}
          txHash={toast.txHash}
          onDismiss={() => setToast(null)}
        />
      )}
      {toast?.kind === "error" && (
        <ForgeErrorToast
          message={toast.message}
          txHash={toast.txHash}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
