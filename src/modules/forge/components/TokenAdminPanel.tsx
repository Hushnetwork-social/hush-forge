"use client";

import { useEffect, useMemo, useState } from "react";
import type { TokenInfo } from "../types";
import { AdminTabIdentity } from "./AdminTabIdentity";
import { AdminTabSupply } from "./AdminTabSupply";
import { AdminTabProperties } from "./AdminTabProperties";
import { AdminTabDangerZone } from "./AdminTabDangerZone";
import type { StagedChange } from "./admin-types";

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

  function applySelected() {
    const selectedCount = stagedChanges.filter((entry) => selectedIds[entry.id]).length;
    if (selectedCount === 0) {
      setBatchInfo("Select one or more staged changes first.");
      return;
    }
    setBatchInfo("Batch execution preview only. Atomic batch contract endpoint will be added before enabling this.");
  }

  function applyAll() {
    if (stagedChanges.length === 0) {
      setBatchInfo("No staged changes to apply.");
      return;
    }
    setBatchInfo("Apply All is in design-preview mode. Contract batch support is required for a single atomic transaction.");
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
              className="px-2 py-1 rounded text-xs"
              style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
            >
              Apply Selected
            </button>
            <button
              onClick={applyAll}
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
      </section>
    </section>
  );
}
