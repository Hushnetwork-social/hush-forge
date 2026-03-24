"use client";

import { useEffect, useRef } from "react";
import { formatTokenAmount } from "../token-economics-logic";
import type { TokenInfo, WalletBalance } from "../types";
import { useTransferFlow } from "../use-transfer-flow";

interface Props {
  token: TokenInfo;
  balance: WalletBalance;
  connectedAddress: string;
  onClose: () => void;
  onTxSubmitted: (txHash: string, message: string) => void;
}

export function TransferTokenDialog({
  token,
  balance,
  connectedAddress,
  onClose,
  onTxSubmitted,
}: Props) {
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const {
    recipientInput,
    setRecipientInput,
    amountInput,
    setAmountInput,
    validationError,
    quoteLoading,
    quoteError,
    confirmation,
    canSubmit,
    submitting,
    submittedTxHash,
    submitError,
    submit,
    reset,
  } = useTransferFlow(token, balance, connectedAddress);

  useEffect(() => {
    recipientInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        reset();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, reset, submitting]);

  useEffect(() => {
    if (submittedTxHash === null) return;
    onTxSubmitted(
      submittedTxHash,
      `Waiting for ${token.symbol} transfer confirmation...`
    );
    reset();
    onClose();
  }, [onClose, onTxSubmitted, reset, submittedTxHash, token.symbol]);

  const visibleError =
    submitError ??
    quoteError ??
    (recipientInput.trim().length > 0 || amountInput.trim().length > 0
      ? validationError
      : null);
  const balanceDisplay = formatTokenAmount(balance.amount, token.decimals);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Transfer ${token.symbol}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          reset();
          onClose();
        }
      }}
    >
      <section
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              Transfer {token.symbol}
            </h2>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Wallet balance: {balanceDisplay} {token.symbol}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close transfer dialog"
            onClick={() => {
              if (!submitting) {
                reset();
                onClose();
              }
            }}
            disabled={submitting}
            className="opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
            style={{ color: "var(--forge-text-primary)" }}
          >
            X
          </button>
        </div>

        {visibleError && (
          <div
            role="alert"
            className="mb-4 rounded-lg p-3 text-sm"
            style={{
              background: "rgba(255,82,82,0.1)",
              border: "1px solid rgba(255,82,82,0.3)",
              color: "var(--forge-error)",
            }}
          >
            {visibleError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="transfer-recipient"
              className="mb-1 block text-sm"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Recipient address
            </label>
            <input
              ref={recipientInputRef}
              id="transfer-recipient"
              type="text"
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              disabled={submitting}
              placeholder="Nh..."
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${
                  visibleError && !recipientInput.trim()
                    ? "var(--forge-error)"
                    : "var(--forge-border-medium)"
                }`,
                color: "var(--forge-text-primary)",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="transfer-amount"
              className="mb-1 block text-sm"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Amount to transfer
            </label>
            <input
              id="transfer-amount"
              type="text"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              disabled={submitting}
              placeholder={`0 ${token.symbol}`}
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${
                  visibleError && !amountInput.trim()
                    ? "var(--forge-error)"
                    : "var(--forge-border-medium)"
                }`,
                color: "var(--forge-text-primary)",
              }}
            />
          </div>

          <div
            aria-label="Transfer economics summary"
            className="rounded-xl p-4 text-sm"
            style={{
              background: "var(--forge-bg-primary)",
              border: "1px solid var(--forge-border-subtle)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: "var(--forge-text-muted)" }}>Transfer amount</span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {confirmation?.amountDisplay ?? "0"} {token.symbol}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span style={{ color: "var(--forge-text-muted)" }}>Recipient receives</span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {confirmation?.recipientAmountDisplay ?? "0"} {token.symbol}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span style={{ color: "var(--forge-text-muted)" }}>Transfer burn</span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {confirmation?.transferBurnAmountDisplay ?? "0"} {token.symbol}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span style={{ color: "var(--forge-text-muted)" }}>Creator fee</span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {confirmation?.creatorFeeDisplay ?? "0 GAS"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span style={{ color: "var(--forge-text-muted)" }}>Platform fee</span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {confirmation?.platformFeeDisplay ?? "0 GAS"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span style={{ color: "var(--forge-text-muted)" }}>Total token GAS taxes</span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {confirmation?.totalGasFeeDisplay ?? "0 GAS"}
              </span>
            </div>
            <p
              className="mt-3 text-xs leading-relaxed"
              style={{ color: "var(--forge-text-muted)" }}
            >
              {quoteLoading
                ? "Loading live transfer quote..."
                : confirmation?.networkFeeDisclaimer}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="flex-1 rounded-lg py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background:
                "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
              color: "var(--forge-text-primary)",
            }}
          >
            {submitting ? "Transferring..." : "Transfer"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!submitting) {
                reset();
                onClose();
              }
            }}
            disabled={submitting}
            className="rounded-lg px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "transparent",
              border: "1px solid var(--forge-border-medium)",
              color: "var(--forge-text-primary)",
            }}
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
