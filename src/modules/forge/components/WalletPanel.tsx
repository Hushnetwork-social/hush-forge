"use client";

import { useEffect, useState } from "react";
import { isFactoryToken } from "../token-economics-logic";
import { useTokenStore } from "../token-store";
import type { TokenInfo, WalletBalance } from "../types";
import { BurnTokenDialog } from "./BurnTokenDialog";
import { TokenIcon } from "./TokenIcon";
import { TransferTokenDialog } from "./TransferTokenDialog";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface Props {
  connectionStatus: ConnectionStatus;
  address: string | null;
  balances: WalletBalance[];
  onConnectClick: () => void;
  onDisconnect: () => void;
  onTxSubmitted: (txHash: string, message: string) => void;
  errorMessage?: string | null;
}

const MAX_FRAC_DIGITS = 5;

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

  if (fracFull.split("").every((char) => char === "0")) {
    return { integer: intPart.toLocaleString(), frac: null };
  }

  if (decimals > MAX_FRAC_DIGITS) {
    return {
      integer: intPart.toLocaleString(),
      frac: `.${fracFull.slice(0, MAX_FRAC_DIGITS)}...`,
    };
  }

  const trimmed = fracFull.replace(/0+$/, "");
  return { integer: intPart.toLocaleString(), frac: `.${trimmed}` };
}

function BalanceSlide({
  balance,
  name,
  imageUrl,
}: {
  balance: WalletBalance;
  name: string | null;
  imageUrl?: string;
}) {
  const { integer, frac } = formatBalance(balance.amount, balance.decimals);
  const displayName = name && name !== balance.symbol ? name : null;

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between px-2">
      <div className="flex min-w-0 items-center gap-2">
        <TokenIcon
          contractHash={balance.contractHash}
          size={36}
          imageUrl={imageUrl}
        />
        <div className="min-w-0">
          <p
            data-testid="wallet-panel-current-symbol"
            className="text-2xl font-bold leading-none"
            style={{ color: "var(--forge-text-primary)" }}
          >
            {balance.symbol}
          </p>
          <p
            className="mt-1 truncate text-xs"
            style={{ color: "var(--forge-text-muted)", minHeight: "1rem" }}
          >
            {displayName ?? ""}
          </p>
        </div>
      </div>

      <div className="ml-4 flex-shrink-0 text-right">
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
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--forge-text-muted)", minHeight: "1rem" }}
          aria-label="Price in USD"
        >
          $ -
        </p>
      </div>
    </div>
  );
}

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
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-opacity"
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
      {direction === "left" ? "<" : ">"}
    </button>
  );
}

function DotIndicators({
  count,
  current,
  onDotClick,
}: {
  count: number;
  current: number;
  onDotClick: (index: number) => void;
}) {
  if (count <= 1) return null;

  return (
    <div className="mt-3 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          aria-label={`Go to token ${index + 1}`}
          onClick={() => onDotClick(index)}
          className="rounded-full transition-all"
          style={{
            width: index === current ? 16 : 6,
            height: 6,
            background:
              index === current
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

export function WalletPanel({
  connectionStatus,
  address,
  balances,
  onConnectClick,
  errorMessage,
  onTxSubmitted,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);
  const [burnOpen, setBurnOpen] = useState(false);

  const tokens = useTokenStore((state) => state.tokens);
  const nameByHash = new Map(tokens.map((token) => [token.contractHash, token.name]));
  const imageUrlByHash = new Map(
    tokens.map((token) => [token.contractHash, token.imageUrl])
  );
  const tokenByHash = new Map<string, TokenInfo>(
    tokens.map((token) => [token.contractHash, token])
  );

  const safeIndex = Math.min(currentIndex, Math.max(0, balances.length - 1));
  const current = balances[safeIndex] ?? null;
  const currentToken =
    current === null ? null : (tokenByHash.get(current.contractHash) ?? null);
  const transferAvailable =
    current !== null &&
    currentToken !== null &&
    isFactoryToken(currentToken) &&
    current.amount > 0n;
  const burnAvailable = transferAvailable;

  useEffect(() => {
    if (!burnAvailable && burnOpen) {
      setBurnOpen(false);
    }
  }, [burnAvailable, burnOpen]);

  useEffect(() => {
    if (!transferAvailable && transferOpen) {
      setTransferOpen(false);
    }
  }, [transferAvailable, transferOpen]);

  function prev() {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function next() {
    setCurrentIndex((index) => Math.min(balances.length - 1, index + 1));
  }

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
          className="mb-4 text-center text-sm"
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

  if (connectionStatus === "connecting") {
    return (
      <div
        className="flex items-center justify-center rounded-xl p-5"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        <span style={{ color: "var(--forge-text-muted)" }}>Connecting...</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="rounded-xl px-4 pb-4 pt-3"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        <p className="mb-3 text-xs" style={{ color: "var(--forge-text-muted)" }}>
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Wallet"}
        </p>

        {balances.length === 0 ? (
          <p
            className="py-2 text-center text-sm"
            style={{ color: "var(--forge-text-muted)" }}
          >
            No tokens found
          </p>
        ) : (
          <>
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
                  imageUrl={imageUrlByHash.get(current.contractHash)}
                />
              )}

              <ArrowButton
                direction="right"
                disabled={safeIndex === balances.length - 1}
                onClick={next}
              />
            </div>

            <DotIndicators
              count={balances.length}
              current={safeIndex}
              onDotClick={setCurrentIndex}
            />

            {transferAvailable && current && currentToken && address && (
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  data-testid="wallet-panel-transfer-action"
                  onClick={() => setTransferOpen(true)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--forge-border-medium)",
                    color: "var(--forge-text-primary)",
                  }}
                >
                  Transfer
                </button>
                <button
                  type="button"
                  data-testid="wallet-panel-burn-action"
                  onClick={() => setBurnOpen(true)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
                    color: "var(--forge-text-primary)",
                  }}
                >
                  Burn
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {transferOpen && current && currentToken && address && (
        <TransferTokenDialog
          token={currentToken}
          balance={current}
          connectedAddress={address}
          onClose={() => setTransferOpen(false)}
          onTxSubmitted={onTxSubmitted}
        />
      )}

      {burnOpen && current && currentToken && (
        <BurnTokenDialog
          token={currentToken}
          balance={current}
          onClose={() => setBurnOpen(false)}
          onTxSubmitted={onTxSubmitted}
        />
      )}
    </>
  );
}
