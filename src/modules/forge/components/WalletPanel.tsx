"use client";

import { useState } from "react";
import type { WalletBalance } from "../types";
import { useTokenStore } from "../token-store";
import { TokenIcon } from "./TokenIcon";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface Props {
  connectionStatus: ConnectionStatus;
  address: string | null;
  balances: WalletBalance[];
  onConnectClick: () => void;
  onDisconnect: () => void;
  errorMessage?: string | null;
}

/** Max decimal digits shown before appending "…" */
const MAX_FRAC_DIGITS = 5;

// ---------------------------------------------------------------------------
// Balance formatting (unchanged)
// ---------------------------------------------------------------------------

function formatBalance(
  amount: bigint,
  decimals: number
): { integer: string; frac: string | null } {
  if (decimals === 0) {
    return { integer: amount.toLocaleString(), frac: null };
  }

  const factor = 10n ** BigInt(decimals);
  const intPart = amount / factor;
  const fracPart = amount % factor;
  const fracFull = fracPart.toString().padStart(decimals, "0");

  if (fracFull.split("").every((c) => c === "0")) {
    return { integer: intPart.toLocaleString(), frac: null };
  }

  if (decimals > MAX_FRAC_DIGITS) {
    return {
      integer: intPart.toLocaleString(),
      frac: `.${fracFull.slice(0, MAX_FRAC_DIGITS)}…`,
    };
  }

  const trimmed = fracFull.replace(/0+$/, "");
  return { integer: intPart.toLocaleString(), frac: `.${trimmed}` };
}

// ---------------------------------------------------------------------------
// Carousel slide
// ---------------------------------------------------------------------------

function BalanceSlide({
  balance,
  name,
}: {
  balance: WalletBalance;
  name: string | null;
}) {
  const { integer, frac } = formatBalance(balance.amount, balance.decimals);
  const displayName = name && name !== balance.symbol ? name : null;

  return (
    <div className="flex items-center justify-between flex-1 min-w-0 px-2">
      {/* Left: icon + symbol + name */}
      <div className="flex items-center gap-2 min-w-0">
        <TokenIcon contractHash={balance.contractHash} size={36} />
        <div className="min-w-0">
          <p
            className="text-2xl font-bold leading-none"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {balance.symbol}
          </p>
          {/* Always rendered — keeps height identical whether or not there's a name */}
          <p
            className="text-xs mt-1 truncate"
            style={{ color: "var(--forge-text-muted)", minHeight: "1rem" }}
          >
            {displayName ?? ""}
          </p>
        </div>
      </div>

      {/* Right: balance + price placeholder (always two lines for fixed height) */}
      <div className="text-right flex-shrink-0 ml-4">
        <div>
          <span
            className="text-2xl font-bold"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {integer}
          </span>
          {frac && (
            <span
              className="text-sm"
              style={{ color: "var(--forge-text-muted)" }}
            >
              {frac}
            </span>
          )}
        </div>
        {/* Price placeholder — always rendered, same height as name row */}
        <p
          className="text-xs mt-1"
          style={{ color: "var(--forge-text-muted)", minHeight: "1rem" }}
          aria-label="Price in USD"
        >
          $ —
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arrow button
// ---------------------------------------------------------------------------

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={direction === "left" ? "Previous token" : "Next token"}
      onClick={onClick}
      disabled={disabled}
      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-opacity"
      style={{
        background: disabled ? "transparent" : "rgba(255,255,255,0.06)",
        color: disabled
          ? "var(--forge-border-subtle)"
          : "var(--forge-text-muted)",
        cursor: disabled ? "default" : "pointer",
        fontSize: 18,
        lineHeight: 1,
      }}
    >
      {direction === "left" ? "‹" : "›"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dot indicators
// ---------------------------------------------------------------------------

function DotIndicators({
  count,
  current,
  onDotClick,
}: {
  count: number;
  current: number;
  onDotClick: (i: number) => void;
}) {
  if (count <= 1) return null;
  return (
    <div className="flex justify-center gap-1.5 mt-3">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          aria-label={`Go to token ${i + 1}`}
          onClick={() => onDotClick(i)}
          className="rounded-full transition-all"
          style={{
            width: i === current ? 16 : 6,
            height: 6,
            background:
              i === current
                ? "var(--forge-color-primary)"
                : "var(--forge-border-subtle)",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WalletPanel({
  connectionStatus,
  address,
  balances,
  onConnectClick,
  errorMessage,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Look up token names from the loaded token store
  const tokens = useTokenStore((s) => s.tokens);
  const nameByHash = new Map(tokens.map((t) => [t.contractHash, t.name]));

  // Clamp index when balances array changes
  const safeIndex = Math.min(currentIndex, Math.max(0, balances.length - 1));

  function prev() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }
  function next() {
    setCurrentIndex((i) => Math.min(balances.length - 1, i + 1));
  }

  // Disconnected / error state
  if (connectionStatus === "disconnected" || connectionStatus === "error") {
    return (
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        {errorMessage && (
          <p className="mb-3 text-sm" style={{ color: "var(--forge-error)" }}>
            {errorMessage}
          </p>
        )}
        <p
          className="mb-4 text-sm text-center"
          style={{ color: "var(--forge-text-muted)" }}
        >
          Connect your Neo wallet to see your portfolio
        </p>
        <button
          onClick={onConnectClick}
          className="w-full rounded-lg py-2 font-semibold"
          style={{
            background: "var(--forge-color-primary)",
            color: "var(--forge-text-primary)",
          }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  // Connecting
  if (connectionStatus === "connecting") {
    return (
      <div
        className="rounded-xl p-5 flex items-center justify-center"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        <span style={{ color: "var(--forge-text-muted)" }}>Connecting…</span>
      </div>
    );
  }

  // Connected
  const current = balances[safeIndex] ?? null;

  return (
    <div
      className="rounded-xl px-4 pt-3 pb-4"
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-medium)",
      }}
    >
      {/* Wallet label */}
      <p
        className="text-xs mb-3"
        style={{ color: "var(--forge-text-muted)" }}
      >
        {address
          ? `${address.slice(0, 6)}…${address.slice(-4)}`
          : "Wallet"}
      </p>

      {balances.length === 0 ? (
        <p
          className="text-sm text-center py-2"
          style={{ color: "var(--forge-text-muted)" }}
        >
          No tokens found
        </p>
      ) : (
        <>
          {/* Carousel row */}
          <div className="flex items-center gap-1">
            <ArrowButton
              direction="left"
              disabled={safeIndex === 0}
              onClick={prev}
            />

            {current && (
              <BalanceSlide
                balance={current}
                name={nameByHash.get(current.contractHash) ?? null}
              />
            )}

            <ArrowButton
              direction="right"
              disabled={safeIndex === balances.length - 1}
              onClick={next}
            />
          </div>

          {/* Dot indicators */}
          <DotIndicators
            count={balances.length}
            current={safeIndex}
            onDotClick={setCurrentIndex}
          />
        </>
      )}
    </div>
  );
}
