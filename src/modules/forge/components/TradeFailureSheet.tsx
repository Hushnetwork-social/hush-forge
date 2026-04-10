"use client";

import Link from "next/link";
import type { MarketTradeFailureState } from "../use-market-trade-flow";

interface Props {
  failure: MarketTradeFailureState;
  onAdjustAmount: () => void;
}

export function TradeFailureSheet({ failure, onAdjustAmount }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={failure.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
    >
      <section
        className="w-full max-w-lg rounded-[28px] p-6"
        style={{
          background: "linear-gradient(180deg, rgba(18, 26, 44, 0.98), rgba(10, 15, 27, 0.98))",
          border: "1px solid rgba(255, 82, 82, 0.24)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-xs uppercase tracking-[0.24em]"
              style={{ color: "rgba(255, 82, 82, 0.82)" }}
            >
              Trade Failure
            </p>
            <h2
              className="mt-2 text-2xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {failure.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close trade failure sheet"
            onClick={onAdjustAmount}
            className="rounded-full px-3 py-1 text-sm"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "var(--forge-text-muted)",
            }}
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
          {failure.message}
        </p>

        {failure.details.length > 0 && (
          <div
            className="mt-5 rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            {failure.details.map((detail) => (
              <div
                key={`${detail.label}-${detail.value}`}
                className="flex items-center justify-between gap-4 py-2"
                style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
              >
                <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  {detail.label}
                </span>
                <span
                  className="text-sm font-semibold text-right"
                  style={{ color: "var(--forge-text-primary)" }}
                >
                  {detail.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onAdjustAmount}
            className="flex-1 rounded-full px-4 py-3 text-sm font-semibold"
            style={{
              background:
                "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
              color: "var(--forge-text-primary)",
            }}
          >
            Adjust Amount
          </button>
          <Link
            href="/markets"
            className="flex-1 rounded-full px-4 py-3 text-center text-sm font-semibold"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "var(--forge-text-primary)",
            }}
          >
            Back To Pairs
          </Link>
        </div>
      </section>
    </div>
  );
}
