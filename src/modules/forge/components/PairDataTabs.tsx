"use client";

import { useState } from "react";
import type { MarketEnhancementCapabilities } from "../types";

type PairTab = "trade-history" | "holders" | "top-traders";

const TABS: { id: PairTab; label: string }[] = [
  { id: "trade-history", label: "Trade History" },
  { id: "holders", label: "Holders" },
  { id: "top-traders", label: "Top Traders" },
];

interface Props {
  capabilities: MarketEnhancementCapabilities;
}

function PlaceholderBody({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-[24px] px-6 py-10 text-center"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <h3
        className="text-xl font-semibold"
        style={{ color: "var(--forge-text-primary)" }}
      >
        {title}
      </h3>
      <p
        className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed"
        style={{ color: "var(--forge-text-muted)" }}
      >
        {body}
      </p>
    </div>
  );
}

export function PairDataTabs({ capabilities }: Props) {
  const [activeTab, setActiveTab] = useState<PairTab>("trade-history");

  return (
    <section
      className="rounded-[28px] p-6"
      style={{
        background: "rgba(12, 18, 31, 0.82)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              className="rounded-full px-4 py-2 text-sm font-semibold"
              style={{
                background: isActive
                  ? "rgba(255,107,53,0.14)"
                  : "rgba(255,255,255,0.04)",
                color: isActive
                  ? "var(--forge-color-primary)"
                  : "var(--forge-text-muted)",
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {activeTab === "trade-history" ? (
          <PlaceholderBody
            title={
              capabilities.tradeHistory
                ? "Trade history ready"
                : "Available after indexer deployment"
            }
            body={
              capabilities.tradeHistory
                ? "The pair route is wired for indexed trade history, but FEAT-075 v1 ships the placeholder shell first."
                : "Historical trades are not reconstructed from curve state in FEAT-075 v1. The FEAT-071 indexer enables the real history surface."
            }
          />
        ) : activeTab === "holders" ? (
          <PlaceholderBody
            title="Holders surface reserved"
            body="The Holders tab stays visible so the final layout is stable, but ranked holder data waits for the indexer-enhanced mode."
          />
        ) : (
          <PlaceholderBody
            title="Top traders surface reserved"
            body="Top-trader analytics remain visible in the information architecture, but FEAT-075 v1 keeps this tab as a capability-gated placeholder."
          />
        )}
      </div>
    </section>
  );
}
