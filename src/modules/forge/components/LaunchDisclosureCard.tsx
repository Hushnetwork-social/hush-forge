"use client";

import { getLaunchProfileDefinition } from "../market-launch-profiles";
import {
  formatMarketPrice,
  formatQuoteAmount,
  formatTokenDisplay,
} from "../market-formatting";
import type { MarketPairReadModel } from "../types";

interface Props {
  pair: MarketPairReadModel;
}

function DisclosureRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
    >
      <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
        {label}
      </span>
      <span
        className="text-sm font-semibold text-right"
        style={{ color: "var(--forge-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function LaunchDisclosureCard({ pair }: Props) {
  return (
    <section
      className="rounded-[28px] p-6"
      style={{
        background: "rgba(12, 18, 31, 0.82)",
        border: "1px solid var(--forge-border-subtle)",
      }}
    >
      <div className="flex flex-col gap-2">
        <p
          className="text-xs uppercase tracking-[0.24em]"
          style={{ color: "var(--forge-text-muted)" }}
        >
          Launch Disclosure
        </p>
        <h2
          className="text-2xl font-semibold"
          style={{ color: "var(--forge-text-primary)" }}
        >
          Public market launch data
        </h2>
        <p className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
          FEAT-074 keeps the original launch split visible for all traders.
        </p>
      </div>

      <div className="mt-4">
        {pair.curve.launchProfile && (
          <DisclosureRow
            label="Launch profile"
            value={getLaunchProfileDefinition(pair.curve.launchProfile).label}
          />
        )}
        {pair.curve.launchProfile && (
          <DisclosureRow
            label="Graduation target"
            value={formatQuoteAmount(pair.curve.graduationThreshold, pair.quoteAsset)}
          />
        )}
        <DisclosureRow
          label="Initial curve inventory"
          value={formatTokenDisplay(
            pair.curve.curveInventory,
            pair.token.decimals,
            pair.token.symbol
          )}
        />
        <DisclosureRow
          label="Initial retained inventory"
          value={formatTokenDisplay(
            pair.curve.retainedInventory,
            pair.token.decimals,
            pair.token.symbol
          )}
        />
        <DisclosureRow
          label="Total supply"
          value={formatTokenDisplay(
            pair.curve.totalSupply,
            pair.token.decimals,
            pair.token.symbol
          )}
        />
        <DisclosureRow
          label="Current curve inventory"
          value={formatTokenDisplay(
            pair.curve.currentCurveInventory,
            pair.token.decimals,
            pair.token.symbol
          )}
        />
        <DisclosureRow
          label="Current price"
          value={formatMarketPrice(
            pair.curve.currentPrice,
            pair.quoteAsset,
            pair.token.decimals
          )}
        />
      </div>
    </section>
  );
}
