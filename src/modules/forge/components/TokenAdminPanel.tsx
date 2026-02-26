"use client";

import { useEffect, useMemo, useState } from "react";
import type { TokenInfo } from "../types";
import { AdminTabIdentity } from "./AdminTabIdentity";
import { AdminTabSupply } from "./AdminTabSupply";
import { AdminTabProperties } from "./AdminTabProperties";
import { AdminTabDangerZone } from "./AdminTabDangerZone";

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

  const tabs = useMemo(() => {
    const list: Array<{ id: AdminTab; label: string }> = [
      { id: "identity", label: "Identity" },
      { id: "properties", label: "Properties" },
      { id: "danger", label: "Danger Zone" },
    ];
    if (showSupply) list.splice(1, 0, { id: "supply", label: "Supply" });
    return list;
  }, [showSupply]);

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
        <AdminTabIdentity token={token} factoryHash={factoryHash} onTxSubmitted={onTxSubmitted} />
      )}
      {activeTab === "supply" && showSupply && (
        <AdminTabSupply token={token} factoryHash={factoryHash} onTxSubmitted={onTxSubmitted} />
      )}
      {activeTab === "properties" && (
        <AdminTabProperties token={token} factoryHash={factoryHash} onTxSubmitted={onTxSubmitted} />
      )}
      {activeTab === "danger" && (
        <AdminTabDangerZone token={token} factoryHash={factoryHash} onTxSubmitted={onTxSubmitted} />
      )}
    </section>
  );
}
