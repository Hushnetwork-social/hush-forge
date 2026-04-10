"use client";

import { useEffect, useState } from "react";
import { getLaunchProfileDefinition } from "../market-launch-profiles";
import {
  dismissMarketLaunchSummary,
  readMarketLaunchSummary,
} from "../market-launch-banner-state";
import { formatTokenAmount } from "../token-economics-logic";

interface Props {
  tokenHash: string;
  decimals: number;
}

export function PostLaunchBanner({ tokenHash, decimals }: Props) {
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [summaryKey, setSummaryKey] = useState(0);

  useEffect(() => {
    setDismissed(false);
  }, [tokenHash]);

  const summary =
    dismissed ? null : readMarketLaunchSummary(tokenHash);

  if (!summary) return null;

  const curveInventory = formatTokenAmount(
    BigInt(summary.curveInventoryRaw),
    decimals
  );
  const retainedInventory = formatTokenAmount(
    BigInt(summary.retainedInventoryRaw),
    decimals
  );
  const launchProfileLabel =
    summary.launchProfile ? getLaunchProfileDefinition(summary.launchProfile).label : null;

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function handleDismiss() {
    dismissMarketLaunchSummary(tokenHash);
    setDismissed(true);
    setSummaryKey((value) => value + 1);
  }

  return (
    <section
      key={summaryKey}
      className="rounded-[28px] px-6 py-5"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,107,53,0.16), rgba(255,176,32,0.12))",
        border: "1px solid rgba(255,176,32,0.2)",
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p
            className="text-xs font-semibold uppercase tracking-[0.24em]"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            Speculation Market Is Live
          </p>
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {summary.pairLabel} created
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed" style={{ color: "var(--forge-text-secondary)" }}>
            {launchProfileLabel ? `${launchProfileLabel} profile activated. ` : ""}
            {curveInventory} {summary.tokenSymbol} committed to the curve.{" "}
            {retainedInventory} {summary.tokenSymbol} remained in the owner wallet.
            Retained tokens trade through the same public market as every other holder.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "var(--forge-text-primary)",
            }}
          >
            {copied ? "Pair URL Copied" : "Share Pair"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              color: "var(--forge-text-primary)",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
