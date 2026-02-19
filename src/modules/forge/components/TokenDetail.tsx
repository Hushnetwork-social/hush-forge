"use client";

import Link from "next/link";
import { useTokenDetail } from "../hooks/useTokenDetail";
import { addNEP17Token } from "../neo-dapi-adapter";
import { NEOTUBE_BASE_URL } from "../forge-config";

interface Props {
  contractHash: string;
  onUpdateClick?: () => void;
}

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatSupply(supply: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  return (supply / factor).toLocaleString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function TokenDetail({ contractHash, onUpdateClick }: Props) {
  const { token, loading, error, isOwnToken, isUpgradeable } =
    useTokenDetail(contractHash);

  function copyHash() {
    navigator.clipboard.writeText(contractHash).catch(() => {});
  }

  async function handleAddToWallet() {
    if (!token) return;
    await addNEP17Token(contractHash, token.symbol, token.decimals);
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Back link */}
      <Link
        href="/tokens"
        className="text-sm mb-6 inline-block"
        style={{ color: "var(--forge-text-muted)" }}
      >
        ← All Tokens
      </Link>

      {/* Contract hash — always visible */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-subtle)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono"
            style={{ color: "var(--forge-text-muted)" }}
          >
            {truncateHash(contractHash)}
          </span>
          <button
            aria-label="Copy contract hash"
            onClick={copyHash}
            className="text-xs opacity-60 hover:opacity-100"
            style={{ color: "var(--forge-text-muted)" }}
          >
            ⎘
          </button>
          <a
            href={`${NEOTUBE_BASE_URL}/contract/${contractHash}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on NeoTube"
            className="text-xs opacity-60 hover:opacity-100"
            style={{ color: "var(--forge-color-primary)" }}
          >
            ↗
          </a>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded text-sm"
          style={{
            background: "rgba(255,82,82,0.1)",
            color: "var(--forge-error)",
            border: "1px solid rgba(255,82,82,0.3)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          aria-label="Loading token details"
          className="rounded-xl p-6 animate-pulse h-48"
          style={{
            background: "var(--forge-bg-card)",
            border: "1px solid var(--forge-border-subtle)",
          }}
        />
      ) : token ? (
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--forge-bg-card)",
            border: `1px solid ${isOwnToken ? "var(--forge-border-own)" : "var(--forge-border-subtle)"}`,
          }}
        >
          {/* Symbol + ownership badges */}
          <div className="flex items-center gap-3 mb-1">
            {isOwnToken && (
              <span
                aria-label="Your token"
                style={{ color: "var(--forge-color-accent)" }}
              >
                ★
              </span>
            )}
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              {token.symbol}
            </h1>
            {isOwnToken && (
              <span
                aria-label={isUpgradeable ? "Upgradeable" : "Not upgradeable"}
              >
                {isUpgradeable ? "🔓" : "🔒"}
              </span>
            )}
          </div>

          <p
            className="text-base mb-4"
            style={{ color: "var(--forge-text-muted)" }}
          >
            {token.name}
          </p>

          {/* Token metadata */}
          <dl className="grid grid-cols-2 gap-3 text-sm mb-6">
            <div>
              <dt style={{ color: "var(--forge-text-muted)" }}>Supply</dt>
              <dd style={{ color: "var(--forge-text-primary)" }}>
                {formatSupply(token.supply, token.decimals)}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--forge-text-muted)" }}>Decimals</dt>
              <dd style={{ color: "var(--forge-text-primary)" }}>
                {token.decimals}
              </dd>
            </div>
            {token.mode && (
              <div>
                <dt style={{ color: "var(--forge-text-muted)" }}>Mode</dt>
                <dd style={{ color: "var(--forge-text-primary)" }}>
                  {token.mode}
                </dd>
              </div>
            )}
            {token.creator && (
              <div>
                <dt style={{ color: "var(--forge-text-muted)" }}>Creator</dt>
                <dd style={{ color: "var(--forge-text-primary)" }}>
                  {truncateHash(token.creator)}
                </dd>
              </div>
            )}
            {token.createdAt !== null && (
              <div>
                <dt style={{ color: "var(--forge-text-muted)" }}>Created</dt>
                <dd style={{ color: "var(--forge-text-primary)" }}>
                  {formatDate(token.createdAt!)}
                </dd>
              </div>
            )}
          </dl>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {isOwnToken && isUpgradeable && (
              <button
                onClick={onUpdateClick}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background:
                    "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
                  color: "var(--forge-text-primary)",
                }}
              >
                Update Token
              </button>
            )}
            <button
              onClick={handleAddToWallet}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                border: "1px solid var(--forge-border-medium)",
                color: "var(--forge-text-primary)",
                background: "transparent",
              }}
            >
              Add to NeoLine
            </button>
            <button
              onClick={handleAddToWallet}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                border: "1px solid var(--forge-border-medium)",
                color: "var(--forge-text-primary)",
                background: "transparent",
              }}
            >
              Add to OneGate
            </button>
          </div>

          {/* Coming-soon placeholders */}
          <div
            className="mt-6 pt-4"
            style={{ borderTop: "1px solid var(--forge-border-subtle)" }}
          >
            <p
              className="text-xs"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Trading — Coming Soon 🔒
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Crowdfunding — Coming Soon 🔒
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
