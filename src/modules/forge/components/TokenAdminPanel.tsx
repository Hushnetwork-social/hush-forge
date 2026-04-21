"use client";

import { useEffect, useMemo, useState } from "react";
import type { PendingTxSubmissionOptions, TokenInfo } from "../types";
import {
  invokeApplyTokenChanges,
  invokeClaimCreatorFee,
  invokeClaimCreatorFees,
} from "../neo-dapi-adapter";
import { parseGasToDatoshi } from "../factory-governance-logic";
import { fetchFactoryConfig } from "../factory-governance-service";
import { AdminTabIdentity } from "./AdminTabIdentity";
import { AdminTabSupply } from "./AdminTabSupply";
import { AdminTabProperties } from "./AdminTabProperties";
import { AdminTabDangerZone } from "./AdminTabDangerZone";
import type { StagedChange } from "./admin-types";
import { toUiErrorMessage } from "./error-utils";

type AdminTab = "identity" | "supply" | "properties" | "danger";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (
    txHash: string,
    message: string,
    options?: PendingTxSubmissionOptions
  ) => void;
}

function formatGas(datoshi: bigint): string {
  const whole = datoshi / 100_000_000n;
  const fraction = (datoshi % 100_000_000n).toString().padStart(8, "0");
  return `${whole.toLocaleString("en-US")}.${fraction}`.replace(/\.?0+$/, "") + " GAS";
}

function toContractMode(mode: string): string {
  if (mode === "speculative") return "speculation";
  if (mode === "crowdfund") return "crowdfunding";
  return mode;
}

export function TokenAdminPanel({ token, factoryHash, onTxSubmitted }: Props) {
  const storageKey = `forge.adminTab.${token.contractHash}`;
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof localStorage === "undefined") return "identity";
    const stored = localStorage.getItem(storageKey) as AdminTab | null;
    if (
      stored === "identity" ||
      stored === "supply" ||
      stored === "properties" ||
      stored === "danger"
    ) {
      return stored;
    }
    return "identity";
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey, activeTab);
  }, [storageKey, activeTab]);

  const showSupply = token.mintable !== false;
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [batchInfo, setBatchInfo] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [creatorClaimAmount, setCreatorClaimAmount] = useState("");
  const [creatorClaimInfo, setCreatorClaimInfo] = useState<string | null>(null);
  const [creatorClaimError, setCreatorClaimError] = useState<string | null>(null);
  const [creatorClaimPending, setCreatorClaimPending] = useState(false);
  const [creatorClaimOperationFee, setCreatorClaimOperationFee] = useState<bigint | null>(null);
  const claimableCreatorFee = token.claimableCreatorFee ?? 0n;
  const showCreatorClaimSection = token.creator !== null;

  useEffect(() => {
    let cancelled = false;

    if (!showCreatorClaimSection || !factoryHash) {
      setCreatorClaimOperationFee(null);
      return () => {
        cancelled = true;
      };
    }

    fetchFactoryConfig(factoryHash)
      .then((config) => {
        if (!cancelled) setCreatorClaimOperationFee(config.operationFee);
      })
      .catch(() => {
        if (!cancelled) setCreatorClaimOperationFee(null);
      });

    return () => {
      cancelled = true;
    };
  }, [factoryHash, showCreatorClaimSection]);

  const tabs = useMemo(() => {
    const list: Array<{ id: AdminTab; label: string }> = [
      { id: "identity", label: "Identity" },
      { id: "properties", label: "Properties" },
      { id: "danger", label: "Danger Zone" },
    ];
    if (showSupply) list.splice(1, 0, { id: "supply", label: "Supply" });
    return list;
  }, [showSupply]);

  function stageChange(change: StagedChange) {
    setStagedChanges((prev) => {
      const deduped = prev.filter((entry) => entry.id !== change.id);
      return [...deduped, change];
    });
    setSelectedIds((prev) => ({ ...prev, [change.id]: true }));
    setBatchInfo("Change staged. You can still send single actions, or apply selected together later.");
  }

  function removeChange(id: string) {
    setStagedChanges((prev) => prev.filter((entry) => entry.id !== id));
    setSelectedIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function buildBatchParams(changes: StagedChange[]) {
    const decimalsFactor = 10n ** BigInt(token.decimals);
    let imageUrl = "";
    let burnRate = -1;
    let creatorFeeRate = -1;
    let newMode = "";
    let newMaxSupply = -1n;
    let mintTo: string | null = null;
    let mintAmount = 0n;
    let lockToken = false;

    for (const change of changes) {
      switch (change.type) {
        case "metadata":
          imageUrl = String(change.payload.imageUrl ?? "").trim();
          break;
        case "burnRate":
          burnRate = Number(change.payload.basisPoints ?? -1);
          break;
        case "creatorFee":
          creatorFeeRate = Number(change.payload.datoshi ?? -1);
          break;
        case "mode":
          newMode = toContractMode(String(change.payload.mode ?? "").trim());
          break;
        case "maxSupply":
          newMaxSupply = BigInt(String(change.payload.maxSupply ?? "-1"));
          break;
        case "mint": {
          const to = String(change.payload.to ?? "").trim();
          const amountWhole = BigInt(Number(change.payload.amount ?? 0));
          mintTo = to.length > 0 ? to : null;
          mintAmount = amountWhole > 0n ? amountWhole * decimalsFactor : 0n;
          break;
        }
        case "lock":
          lockToken = true;
          break;
      }
    }

    return {
      imageUrl,
      burnRate,
      creatorFeeRate,
      newMode,
      modeParams: [] as string[],
      newMaxSupply,
      mintTo,
      mintAmount,
      lockToken,
    };
  }

  async function applyBatch(entries: StagedChange[]) {
    if (!factoryHash) {
      setBatchError("Factory hash is not configured.");
      return;
    }
    if (entries.length === 0) {
      setBatchInfo("Select one or more staged changes first.");
      return;
    }
    const hasMint = entries.some((entry) => entry.type === "mint");
    const hasMaxSupply = entries.some((entry) => entry.type === "maxSupply");
    if (hasMint && hasMaxSupply) {
      setBatchError(
        "Cannot apply Mint and Max Supply in the same staged transaction. " +
          "Set Max Supply first, wait for confirmation, then mint."
      );
      return;
    }

    setApplyingBatch(true);
    setBatchError(null);
    setBatchInfo(null);
    try {
      const txHash = await invokeApplyTokenChanges(
        factoryHash,
        token.contractHash,
        buildBatchParams(entries),
        token.tokenProfile
      );
      onTxSubmitted(txHash, `Applying ${entries.length} staged changes...`);
      const appliedIds = new Set(entries.map((entry) => entry.id));
      setStagedChanges((prev) => prev.filter((entry) => !appliedIds.has(entry.id)));
      setSelectedIds((prev) => {
        const next = { ...prev };
        for (const id of appliedIds) delete next[id];
        return next;
      });
      setBatchInfo(`Submitted ${entries.length} staged change(s) in one transaction.`);
    } catch (err) {
      setBatchError(toUiErrorMessage(err));
    } finally {
      setApplyingBatch(false);
    }
  }

  function applySelected() {
    void applyBatch(stagedChanges.filter((entry) => selectedIds[entry.id]));
  }

  function applyAll() {
    void applyBatch(stagedChanges);
  }

  async function submitCreatorClaimPartial() {
    const trimmed = creatorClaimAmount.trim();
    if (!trimmed) {
      setCreatorClaimError("Amount is required.");
      return;
    }
    if (trimmed.startsWith("-")) {
      setCreatorClaimError("Amount must be greater than 0.");
      return;
    }

    const amount = parseGasToDatoshi(trimmed);
    if (amount === null) {
      setCreatorClaimError("Enter a valid GAS amount with up to 8 decimal places.");
      return;
    }
    if (amount <= 0n) {
      setCreatorClaimError("Amount must be greater than 0.");
      return;
    }
    if (amount > claimableCreatorFee) {
      setCreatorClaimError("Amount cannot exceed the current claimable creator fee balance.");
      return;
    }

    setCreatorClaimPending(true);
    setCreatorClaimError(null);
    setCreatorClaimInfo(null);
    try {
      const txHash = await invokeClaimCreatorFee(token.contractHash, amount);
      onTxSubmitted(txHash, `Claiming creator fees for ${token.symbol}...`);
      setCreatorClaimInfo("Creator-fee claim submitted.");
      setCreatorClaimAmount("");
    } catch (err) {
      setCreatorClaimError(toUiErrorMessage(err));
    } finally {
      setCreatorClaimPending(false);
    }
  }

  async function submitCreatorClaimAll() {
    if (claimableCreatorFee <= 0n) {
      setCreatorClaimError("No claimable creator fees are currently available.");
      return;
    }

    setCreatorClaimPending(true);
    setCreatorClaimError(null);
    setCreatorClaimInfo(null);
    try {
      const txHash = await invokeClaimCreatorFees(token.contractHash);
      onTxSubmitted(txHash, `Claiming creator fees for ${token.symbol}...`);
      setCreatorClaimInfo("Creator-fee claim-all submitted.");
      setCreatorClaimAmount("");
    } catch (err) {
      setCreatorClaimError(toUiErrorMessage(err));
    } finally {
      setCreatorClaimPending(false);
    }
  }

  return (
    <section
      className="rounded-xl p-4 space-y-4"
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
        TOKEN ADMINISTRATION
      </h3>

      {token.locked && (
        <section
          className="rounded-xl p-4"
          style={{
            background: "rgba(0,120,200,0.08)",
            border: "1px solid rgba(0,140,255,0.25)",
          }}
        >
          <h3 className="text-sm font-semibold" style={{ color: "#4fc3f7" }}>
            Permanently Immutable
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--forge-text-muted)" }}>
            This token has been permanently locked. Lifecycle setters are blocked on-chain, but accrued creator fees remain claimable.
          </p>
        </section>
      )}

      {showCreatorClaimSection && (
        <section
          className="rounded-lg p-3 space-y-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--forge-border-subtle)" }}
        >
          <div>
            <h4 className="text-xs font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              CREATOR FEE CLAIMS
            </h4>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
              Creator-fee GAS is held in the token contract until the original creator claims it.
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
              Claim submission also pays the current TokenFactory operation fee
              {creatorClaimOperationFee !== null ? ` (${formatGas(creatorClaimOperationFee)})` : ""}
              {" "}plus the normal Neo network fee in the connected wallet.
            </p>
          </div>

          <div
            className="rounded-lg p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--forge-border-subtle)" }}
          >
            <p className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>
              Claimable Creator GAS
            </p>
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              {formatGas(claimableCreatorFee)}
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              aria-label="Creator fee claim GAS input"
              value={creatorClaimAmount}
              onChange={(event) => setCreatorClaimAmount(event.target.value)}
              placeholder="GAS amount"
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)" }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => void submitCreatorClaimPartial()}
                disabled={creatorClaimPending || claimableCreatorFee <= 0n}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
              >
                Claim Partial
              </button>
              <button
                onClick={() => void submitCreatorClaimAll()}
                disabled={creatorClaimPending || claimableCreatorFee <= 0n}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                style={{ background: "var(--forge-color-primary)", color: "var(--forge-text-primary)" }}
              >
                Claim All
              </button>
            </div>
          </div>

          {creatorClaimInfo && (
            <p className="text-xs" style={{ color: "var(--forge-color-primary)" }}>
              {creatorClaimInfo}
            </p>
          )}
          {creatorClaimError && (
            <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>
              {creatorClaimError}
            </p>
          )}
        </section>
      )}

      {!token.locked && (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Token admin tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{
                  background:
                    activeTab === tab.id
                      ? "rgba(255,107,53,0.2)"
                      : "rgba(255,255,255,0.04)",
                  color:
                    activeTab === tab.id
                      ? "var(--forge-color-primary)"
                      : "var(--forge-text-muted)",
                  border: "1px solid var(--forge-border-subtle)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "identity" && (
            <AdminTabIdentity
              token={token}
              factoryHash={factoryHash}
              onTxSubmitted={onTxSubmitted}
              onStageChange={stageChange}
            />
          )}
          {activeTab === "supply" && showSupply && (
            <AdminTabSupply
              token={token}
              factoryHash={factoryHash}
              onTxSubmitted={onTxSubmitted}
              onStageChange={stageChange}
            />
          )}
          {activeTab === "properties" && (
            <AdminTabProperties
              token={token}
              factoryHash={factoryHash}
              onTxSubmitted={onTxSubmitted}
              onStageChange={stageChange}
            />
          )}
          {activeTab === "danger" && (
            <AdminTabDangerZone
              token={token}
              factoryHash={factoryHash}
              onTxSubmitted={onTxSubmitted}
              onStageChange={stageChange}
            />
          )}

          <section
            className="rounded-lg p-3 space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--forge-border-subtle)" }}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold" style={{ color: "var(--forge-text-primary)" }}>
                STAGED CHANGES ({stagedChanges.length})
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={applySelected}
                  disabled={applyingBatch}
                  className="px-2 py-1 rounded text-xs"
                  style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
                >
                  Apply Selected
                </button>
                <button
                  onClick={applyAll}
                  disabled={applyingBatch}
                  className="px-2 py-1 rounded text-xs"
                  style={{
                    background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
                    color: "var(--forge-text-primary)",
                  }}
                >
                  Apply All
                </button>
              </div>
            </div>

            {stagedChanges.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
                No staged changes yet. Use the Stage buttons in each tab.
              </p>
            ) : (
              <div className="space-y-2">
                {stagedChanges.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <label
                      className="flex items-center gap-2 text-xs min-w-0 flex-1"
                      style={{ color: "var(--forge-text-primary)" }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[entry.id])}
                        onChange={(event) =>
                          setSelectedIds((prev) => ({ ...prev, [entry.id]: event.target.checked }))
                        }
                      />
                      <span className="truncate" title={entry.label} style={{ maxWidth: "100%" }}>
                        {entry.label}
                      </span>
                    </label>
                    <button
                      onClick={() => removeChange(entry.id)}
                      className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                      style={{ border: "1px solid var(--forge-border-subtle)", color: "var(--forge-text-muted)" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {batchInfo && (
              <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
                {batchInfo}
              </p>
            )}
            {batchError && (
              <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>
                {batchError}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
