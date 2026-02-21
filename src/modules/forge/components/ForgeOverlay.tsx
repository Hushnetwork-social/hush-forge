"use client";

import { useEffect, useRef, useState } from "react";
import { useForgeForm } from "../hooks/useForgeForm";

interface Props {
  address: string | null;
  gasBalance: bigint;
  onClose: () => void;
  onTxSubmitted: (txHash: string) => void;
}

export function ForgeOverlay({
  address,
  gasBalance,
  onClose,
  onTxSubmitted,
}: Props) {
  const {
    name,
    setName,
    symbol,
    setSymbol,
    supply,
    setSupply,
    decimals,
    setDecimals,
    imageUrl,
    setImageUrl,
    imagePreview,
    errors,
    validateForm,
    creationFeeDisplay,
    feeLoading,
    gasCheckResult,
    submitting,
    submittedTxHash,
    submitError,
    submit,
  } = useForgeForm(address, gasBalance);

  const [showHostingHints, setShowHostingHints] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Notify parent once TX hash is returned
  useEffect(() => {
    if (submittedTxHash) {
      onTxSubmitted(submittedTxHash);
    }
  }, [submittedTxHash, onTxSubmitted]);

  // Move focus into the dialog on open
  useEffect(() => {
    const first = cardRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled])'
    );
    first?.focus();
  }, []);

  // Escape + Tab focus trap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!submitting) onClose();
        return;
      }
      if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const focusable = Array.from(
          card.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitting, onClose]);

  const gasInsufficient = gasCheckResult !== null && !gasCheckResult.sufficient;
  const hasErrors = Object.keys(errors).length > 0;
  const forgeDisabled = submitting || gasInsufficient || feeLoading || hasErrors;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Forge a Token"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="w-full max-w-lg rounded-2xl p-6 mx-4"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid rgba(255,107,53,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--forge-color-primary)" }}
          >
            🔥 Forge a Token
          </h2>
          <button
            aria-label="Close"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
            style={{ color: "var(--forge-text-primary)" }}
          >
            ✕
          </button>
        </div>

        {/* Wallet rejection / generic error banner */}
        {submitError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded text-sm"
            style={{
              background: "rgba(255,82,82,0.1)",
              color: "var(--forge-error)",
              border: "1px solid rgba(255,82,82,0.3)",
            }}
          >
            ⚠ {submitError}
          </div>
        )}

        {/* Form fields */}
        <div className="flex flex-col gap-4">
          {/* Token Name */}
          <div>
            <label
              htmlFor="token-name"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Token Name
            </label>
            <input
              id="token-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={validateForm}
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${errors.name ? "var(--forge-error)" : "var(--forge-border-medium)"}`,
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
            {errors.name && (
              <p className="text-xs mt-1" style={{ color: "var(--forge-error)" }}>
                {errors.name}
              </p>
            )}
          </div>

          {/* Symbol */}
          <div>
            <label
              htmlFor="token-symbol"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Symbol <span className="text-xs">(A-Z only, 2-10)</span>
            </label>
            <input
              id="token-symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onBlur={validateForm}
              maxLength={10}
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm uppercase disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${errors.symbol ? "var(--forge-error)" : "var(--forge-border-medium)"}`,
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
            {errors.symbol && (
              <p className="text-xs mt-1" style={{ color: "var(--forge-error)" }}>
                {errors.symbol}
              </p>
            )}
          </div>

          {/* Supply */}
          <div>
            <label
              htmlFor="token-supply"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Total Supply
            </label>
            <input
              id="token-supply"
              type="text"
              value={supply}
              onChange={(e) => setSupply(e.target.value)}
              onBlur={validateForm}
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${errors.supply ? "var(--forge-error)" : "var(--forge-border-medium)"}`,
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
            {errors.supply && (
              <p className="text-xs mt-1" style={{ color: "var(--forge-error)" }}>
                {errors.supply}
              </p>
            )}
          </div>

          {/* Decimals */}
          <div>
            <label
              htmlFor="token-decimals"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Decimals <span className="text-xs">(0 – 18)</span>
            </label>
            <input
              id="token-decimals"
              type="text"
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              onBlur={validateForm}
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${errors.decimals ? "var(--forge-error)" : "var(--forge-border-medium)"}`,
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
            {errors.decimals && (
              <p className="text-xs mt-1" style={{ color: "var(--forge-error)" }}>
                {errors.decimals}
              </p>
            )}
          </div>

          {/* Mode — Community only for MVP */}
          <div>
            <label
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Mode
            </label>
            <div className="flex flex-col gap-1">
              <label
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--forge-text-primary)" }}
              >
                <input type="radio" name="mode" defaultChecked readOnly />
                Community
              </label>
              <label
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--forge-text-muted)" }}
              >
                <input type="radio" name="mode" disabled />
                Crowdfund
                <span className="text-xs">— coming soon</span>
              </label>
              <label
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--forge-text-muted)" }}
              >
                <input type="radio" name="mode" disabled />
                Speculative
                <span className="text-xs">— coming soon</span>
              </label>
            </div>
          </div>

          {/* Image URL (optional) */}
          <div>
            <label
              htmlFor="token-image-url"
              className="text-sm mb-1 block"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Token Image URL{" "}
              <span className="text-xs">(optional)</span>
            </label>
            <input
              id="token-image-url"
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={submitting}
              placeholder="https://…"
              className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--forge-bg-primary)",
                border: `1px solid ${errors.imageUrl ? "var(--forge-error)" : "var(--forge-border-medium)"}`,
                color: "var(--forge-text-primary)",
                outline: "none",
              }}
            />
            <p className="text-xs mt-1" style={{ color: "var(--forge-text-muted)" }}>
              Direct link to your token icon (PNG/SVG, square, 256×256+ recommended)
            </p>
            {errors.imageUrl && (
              <p className="text-xs mt-1" style={{ color: "var(--forge-error)" }}>
                {errors.imageUrl}
              </p>
            )}

            {/* Image preview panel */}
            {imageUrl.trim() && (
              <div
                className="flex items-center gap-2 mt-2 p-2 rounded-lg text-xs"
                style={{ background: "var(--forge-bg-primary)" }}
              >
                {imagePreview === "loading" && (
                  <span style={{ color: "var(--forge-text-muted)" }}>
                    Checking image…
                  </span>
                )}
                {imagePreview === "ok" && (
                  <>
                    <img
                      src={imageUrl.trim()}
                      alt="Token icon preview"
                      className="rounded-full flex-shrink-0"
                      style={{ width: 48, height: 48, objectFit: "cover" }}
                    />
                    <span style={{ color: "var(--forge-success)" }}>
                      ✓ Image loaded
                    </span>
                  </>
                )}
                {imagePreview === "error" && (
                  <span style={{ color: "var(--forge-error)" }}>
                    ⚠ Could not load image — check the URL
                  </span>
                )}
              </div>
            )}

            {/* Collapsible hosting hints */}
            <button
              type="button"
              onClick={() => setShowHostingHints((v) => !v)}
              className="text-xs mt-2 transition-opacity hover:opacity-80"
              style={{ color: "var(--forge-color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Where to host your image? {showHostingHints ? "▲" : "▼"}
            </button>
            {showHostingHints && (
              <div
                className="mt-2 p-3 rounded-lg text-xs leading-relaxed"
                style={{
                  background: "var(--forge-bg-primary)",
                  border: "1px solid var(--forge-border-subtle)",
                  color: "var(--forge-text-muted)",
                }}
              >
                <p className="font-semibold mb-2" style={{ color: "var(--forge-text-secondary)" }}>
                  Free options
                </p>
                <ul className="space-y-1 mb-3">
                  <li><strong>NFT.Storage</strong> (nft.storage) — IPFS, free, permanent — best for decentralized tokens</li>
                  <li><strong>Pinata</strong> (pinata.cloud) — IPFS pinning, free tier 1 GB</li>
                  <li><strong>ImgBB</strong> (imgbb.com) — Simple free image hosting, direct links</li>
                  <li><strong>GitHub raw</strong> — Public repo image at raw.githubusercontent.com/…</li>
                  <li><strong>Imgur</strong> — Free, widely accessible</li>
                </ul>
                <p className="font-semibold mb-2" style={{ color: "var(--forge-text-secondary)" }}>
                  Paid / professional
                </p>
                <ul className="space-y-1 mb-2">
                  <li><strong>Cloudflare R2</strong> — S3-compatible, no egress fees, reliable CDN</li>
                  <li><strong>AWS S3 + CloudFront</strong> — Industry standard, low cost</li>
                  <li><strong>Pinata Pro</strong> — Dedicated IPFS pinning SLA</li>
                </ul>
                <p style={{ color: "var(--forge-color-primary)" }}>
                  Tip: For permanent token identity, IPFS (NFT.Storage or Pinata) is recommended.
                </p>
              </div>
            )}
          </div>

          {/* Fee info box */}
          <div
            className="rounded-lg p-3 text-sm"
            style={{
              background: "var(--forge-bg-primary)",
              border: "1px solid var(--forge-border-subtle)",
            }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--forge-text-muted)" }}>
                Creation fee
              </span>
              <span style={{ color: "var(--forge-text-primary)" }}>
                {feeLoading ? "Loading…" : `~${creationFeeDisplay} GAS`}
              </span>
            </div>
            {gasCheckResult !== null && (
              <div className="flex justify-between mt-1">
                <span style={{ color: "var(--forge-text-muted)" }}>
                  Your GAS balance
                </span>
                <span
                  style={{
                    color: gasCheckResult.sufficient
                      ? "var(--forge-success)"
                      : "var(--forge-error)",
                  }}
                >
                  {(Number(gasCheckResult.actual) / 1e8).toFixed(2)}{" "}
                  {gasCheckResult.sufficient ? "✓" : "✗"}
                </span>
              </div>
            )}
            {gasInsufficient && (
              <p className="mt-2 text-xs" style={{ color: "var(--forge-error)" }}>
                ⚠ Insufficient GAS. Need at least {creationFeeDisplay} GAS + network fees.
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={submit}
            disabled={forgeDisabled}
            className="flex-1 py-3 rounded-lg font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background:
                "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
              color: "var(--forge-text-primary)",
            }}
          >
            {submitting ? "⏳ Forging…" : "🔥 FORGE"}
          </button>
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="px-5 py-3 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: "1px solid var(--forge-border-medium)",
              color: "var(--forge-text-primary)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
