"use client";

import { useEffect, useMemo, useState } from "react";
import type { TokenInfo } from "../types";
import { invokeApplyTokenChanges } from "../neo-dapi-adapter";
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
  onTxSubmitted: (txHash: string, message: string) => void;
}

export function TokenAdminPanel({ token, factoryHash, onTxSubmitted }: Props) {
  const storageKey = `forge.adminTab.${token.contractHash}`;
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof localStorage === "undefined") return "identity";
    const stored = localStorage.getItem(storageKey) as AdminTab | null;
    if (stored === "identity" || stored === "supply" || stored === "properties" || stored === "danger") {
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
          newMode = String(change.payload.mode ?? "").trim();
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
        buildBatchParams(entries)
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

  if (token.locked) {
    return (
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
          This token has been permanently locked. All setters are blocked on-chain.
        </p>
      </section>
    );
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
                    onChange={(e) => setSelectedIds((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                  />
                  <span
                    className="truncate"
                    title={entry.label}
                    style={{ maxWidth: "100%" }}
                  >
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
    </section>
  );
}
