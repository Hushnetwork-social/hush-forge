"use client";

import type { TokenEconomicsView } from "../types";

interface Props {
  economics: TokenEconomicsView;
}

export function TokenEconomicsPanel({ economics }: Props) {
  return (
    <section
      aria-label="Token economics"
      className="rounded-xl p-4"
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="mb-4">
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--forge-text-primary)" }}
        >
          Token Economics
        </h2>
        <p
          className="mt-1 text-xs leading-relaxed"
          style={{ color: "var(--forge-text-muted)" }}
        >
          These are the current contract-enforced values for TokenFactory
          transfers and holder burns. Wallets may present chain fees separately
          at submission time.
        </p>
      </div>

      <dl className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <dt
            className="text-xs uppercase"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Burn Rate
          </dt>
          <dd
            className="text-sm font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {economics.burnRateDisplay}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt
            className="text-xs uppercase"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Creator Fee
          </dt>
          <dd
            className="text-sm font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {economics.creatorFeeDisplay}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt
            className="text-xs uppercase"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Platform Fee
          </dt>
          <dd
            className="text-sm font-semibold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {economics.platformFeeDisplay}
          </dd>
        </div>
      </dl>

      <p
        className="mt-4 text-xs leading-relaxed"
        style={{ color: "var(--forge-text-muted)" }}
      >
        {economics.networkFeeDisclaimer}
      </p>
    </section>
  );
}
