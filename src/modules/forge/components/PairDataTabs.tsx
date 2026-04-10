"use client";

import { useState } from "react";
import {
  formatMarketPrice,
  formatProgressPercent,
  formatQuoteAmountSummary,
  formatTokenDisplayRounded,
} from "../market-formatting";
import type {
  MarketActivitySnapshot,
  MarketPairReadModel,
} from "../types";

type PairTab = "trade-history" | "holders" | "top-traders";

const TABS: { id: PairTab; label: string }[] = [
  { id: "trade-history", label: "Trade History" },
  { id: "holders", label: "Holders" },
  { id: "top-traders", label: "Top Traders" },
];

interface Props {
  pair: MarketPairReadModel;
  activity: MarketActivitySnapshot | null;
  activityLoading: boolean;
  activityError: string | null;
}

function EmptyBody({
  title,
  body,
  tone = "muted",
}: {
  title: string;
  body: string;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className="rounded-[24px] px-6 py-10 text-center"
      style={{
        background:
          tone === "error" ? "rgba(255,82,82,0.08)" : "rgba(255,255,255,0.03)",
        border:
          tone === "error" ? "1px solid rgba(255,82,82,0.18)" : "1px solid transparent",
      }}
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

function truncateAddress(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatOccurredAt(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function PairDataTabs({
  pair,
  activity,
  activityLoading,
  activityError,
}: Props) {
  const [activeTab, setActiveTab] = useState<PairTab>("trade-history");

  function renderTradeHistory() {
    if (activityLoading && !activity) {
      return (
        <EmptyBody
          title="Replaying on-chain trades"
          body="The first activity snapshot is being assembled from settled router events."
        />
      );
    }

    if (activityError && !activity) {
      return (
        <EmptyBody
          title="On-chain replay unavailable"
          body={activityError}
          tone="error"
        />
      );
    }

    if (!activity || activity.trades.length === 0) {
      return (
        <EmptyBody
          title="No trades yet"
          body="Trade history appears here immediately after the first settled buy or sell."
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr style={{ color: "var(--forge-text-muted)" }}>
              {["Time", "Side", "Trader", "Price", "Quote", "Tokens"].map((label) => (
                <th
                  key={label}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.trades.map((trade) => (
              <tr
                key={trade.id}
                style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
              >
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatOccurredAt(trade.occurredAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold uppercase"
                    style={{
                      background:
                        trade.side === "buy"
                          ? "rgba(255,107,53,0.14)"
                          : "rgba(255,255,255,0.05)",
                      color:
                        trade.side === "buy"
                          ? "var(--forge-color-primary)"
                          : "var(--forge-text-muted)",
                    }}
                  >
                    {trade.side}
                  </span>
                </td>
                <td
                  className="px-4 py-3 text-sm font-medium"
                  style={{ color: "var(--forge-text-primary)" }}
                  title={trade.trader}
                >
                  {truncateAddress(trade.trader)}
                </td>
                <td
                  className="px-4 py-3 text-sm font-medium"
                  style={{ color: "var(--forge-text-primary)" }}
                >
                  {formatMarketPrice(trade.price, pair.quoteAsset, pair.token.decimals)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatQuoteAmountSummary(trade.quoteAmount, pair.quoteAsset)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatTokenDisplayRounded(
                    trade.tokenAmount,
                    pair.token.decimals,
                    pair.token.symbol
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderHolders() {
    if (activityLoading && !activity) {
      return (
        <EmptyBody
          title="Rebuilding holder balances"
          body="Holder balances are derived from token Transfer events as the on-chain replay catches up."
        />
      );
    }

    if (activityError && !activity) {
      return (
        <EmptyBody
          title="Holder replay unavailable"
          body={activityError}
          tone="error"
        />
      );
    }

    if (!activity || activity.holders.length === 0) {
      return (
        <EmptyBody
          title="No holder data yet"
          body="Top holders appear here once Transfer activity has been observed for this market."
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr style={{ color: "var(--forge-text-muted)" }}>
              {["#", "Address", "Balance", "Share"].map((label) => (
                <th
                  key={label}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.holders.map((holder) => (
              <tr
                key={`${holder.address}-${holder.rank}`}
                style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
              >
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {holder.rank}
                </td>
                <td
                  className="px-4 py-3 text-sm font-medium"
                  style={{ color: "var(--forge-text-primary)" }}
                  title={holder.address}
                >
                  {truncateAddress(holder.address)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatTokenDisplayRounded(
                    holder.balance,
                    pair.token.decimals,
                    pair.token.symbol
                  )}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {holder.shareBps === null ? "-" : formatProgressPercent(holder.shareBps)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderTopTraders() {
    if (activityLoading && !activity) {
      return (
        <EmptyBody
          title="Compiling top traders"
          body="Trader ranks are aggregated from the same on-chain replay used for the 15m candle preview."
        />
      );
    }

    if (activityError && !activity) {
      return (
        <EmptyBody
          title="Top trader replay unavailable"
          body={activityError}
          tone="error"
        />
      );
    }

    if (!activity || activity.topTraders.length === 0) {
      return (
        <EmptyBody
          title="No top traders yet"
          body="Trader rankings appear after the first settled activity begins flowing through the pair."
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr style={{ color: "var(--forge-text-muted)" }}>
              {["#", "Address", "Trades", "Buy Vol", "Sell Vol", "Net"].map((label) => (
                <th
                  key={label}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.topTraders.map((trader) => (
              <tr
                key={`${trader.address}-${trader.rank}`}
                style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
              >
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {trader.rank}
                </td>
                <td
                  className="px-4 py-3 text-sm font-medium"
                  style={{ color: "var(--forge-text-primary)" }}
                  title={trader.address}
                >
                  {truncateAddress(trader.address)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {trader.totalTrades.toLocaleString("en-US")}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatQuoteAmountSummary(trader.buyVolume, pair.quoteAsset)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatQuoteAmountSummary(trader.sellVolume, pair.quoteAsset)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {formatQuoteAmountSummary(trader.netQuoteVolume, pair.quoteAsset)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

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
        {activeTab === "trade-history"
          ? renderTradeHistory()
          : activeTab === "holders"
            ? renderHolders()
            : renderTopTraders()}
      </div>
    </section>
  );
}
