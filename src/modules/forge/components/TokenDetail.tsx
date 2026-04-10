"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTokenDetail } from "../hooks/useTokenDetail";
import { useTokenTransfers } from "../hooks/useTokenTransfers";
import { TokenIcon } from "./TokenIcon";
import type { TokenTransfer } from "../hooks/useTokenTransfers";
import { useWalletStore } from "../wallet-store";
import { addNEP17Token } from "../neo-dapi-adapter";
import { getRuntimeFactoryHash, NEOTUBE_BASE_URL } from "../forge-config";
import { BurnBadge } from "./BurnBadge";
import { LockBadge } from "./LockBadge";
import { TokenAdminPanel } from "./TokenAdminPanel";
import { TokenEconomicsPanel } from "./TokenEconomicsPanel";
import type { PendingTxSubmissionOptions } from "../types";

interface Props {
  contractHash: string;
  onTxSubmitted: (
    txHash: string,
    message: string,
    options?: PendingTxSubmissionOptions
  ) => void;
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--forge-border-subtle)" }}>
      <dt className="text-xs mb-1" style={{ color: "var(--forge-text-muted)" }}>{label}</dt>
      <dd className="text-sm font-semibold truncate" style={{ color: "var(--forge-text-primary)" }}>{value}</dd>
    </div>
  );
}

function TransferRow({ tx, symbol, decimals, neotubeTxUrl }: { tx: TokenTransfer; symbol: string; decimals: number; neotubeTxUrl: string }) {
  const isIn = tx.direction === "in";
  const factor = 10n ** BigInt(decimals);
  const whole = tx.amount / factor;
  const counterparty = tx.counterparty ? `${tx.counterparty.slice(0, 6)}...${tx.counterparty.slice(-4)}` : "-";
  const date = new Date(tx.timestamp).toLocaleDateString();

  return (
    <div className="flex items-center gap-3 py-2 text-xs" style={{ borderBottom: "1px solid var(--forge-border-subtle)" }}>
      <span className="font-bold flex-shrink-0 w-4 text-center" style={{ color: isIn ? "var(--forge-success)" : "var(--forge-color-primary)" }}>
        {isIn ? "IN" : "OUT"}
      </span>
      <span className="font-semibold flex-shrink-0 w-28 text-right" style={{ color: isIn ? "var(--forge-success)" : "var(--forge-color-primary)" }}>
        {isIn ? "+" : "-"}
        {whole.toLocaleString()} {symbol}
      </span>
      <span className="flex-1 truncate font-mono" style={{ color: "var(--forge-text-muted)" }}>
        {isIn ? "from" : "to"} {counterparty}
      </span>
      <span className="flex-shrink-0" style={{ color: "var(--forge-text-muted)" }}>{date}</span>
      <a href={neotubeTxUrl} target="_blank" rel="noopener noreferrer" aria-label="View transaction on NeoTube" className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity" style={{ color: "var(--forge-color-primary)" }}>
        LINK
      </a>
    </div>
  );
}

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatSupply(supply: bigint, decimals: number): string {
  if (supply === 0n) return "-";
  const factor = 10n ** BigInt(decimals);
  return (supply / factor).toLocaleString();
}

function formatDate(timestamp: number): string {
  // Runtime timestamps can arrive in seconds or milliseconds depending on source.
  // Heuristic: values above year-2286 seconds threshold are treated as milliseconds.
  const ms = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(ms).toLocaleDateString();
}

const MODE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  community: { label: "Community", color: "#00c8d8", bg: "rgba(0,180,200,0.15)" },
  crowdfund: { label: "Crowdfund", color: "#00c050", bg: "rgba(0,180,80,0.15)" },
  speculative: { label: "Speculative", color: "#ff9600", bg: "rgba(255,140,0,0.15)" },
};

function ModeBadge({ mode }: { mode: string }) {
  const cfg = MODE_CONFIG[mode.toLowerCase()];
  if (!cfg) return null;
  return <span className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}

export function TokenDetail({ contractHash, onTxSubmitted }: Props) {
  const { token, economics, loading, error, isOwnToken, isUpgradeable } =
    useTokenDetail(contractHash);
  const walletAddress = useWalletStore((s) => s.address);
  const { transfers, supported } = useTokenTransfers(contractHash, walletAddress);
  const [copied, setCopied] = useState(false);
  const adminHintStorageKey = `forge.adminHintDismissed.${contractHash}`;
  const [hintDismissedInSession, setHintDismissedInSession] = useState(false);
  const hintDismissedPersisted =
    typeof localStorage !== "undefined" &&
    localStorage.getItem(adminHintStorageKey) === "1";
  const showAdminHint =
    isOwnToken &&
    isUpgradeable &&
    !(token?.locked ?? false) &&
    !hintDismissedInSession &&
    !hintDismissedPersisted;

  function dismissAdminHint() {
    setHintDismissedInSession(true);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(adminHintStorageKey, "1");
    }
  }

  useEffect(() => {
    if (!showAdminHint) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setHintDismissedInSession(true);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(adminHintStorageKey, "1");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAdminHint, adminHintStorageKey]);

  function copyHash() {
    navigator.clipboard
      .writeText(contractHash)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  async function handleAddToWallet() {
    if (!token) return;
    await addNEP17Token(contractHash, token.symbol, token.decimals);
  }

  const factoryHash = getRuntimeFactoryHash();
  const marketHref = token?.mode === "speculative" ? `/markets/${contractHash}` : null;
  const canLaunchSpeculation = Boolean(
    token &&
      isOwnToken &&
      isUpgradeable &&
      token.mode === "community" &&
      !(token.locked ?? false)
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {showAdminHint && (
        <div
          data-testid="admin-update-hint-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={dismissAdminHint}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Admin update options"
            className="w-full max-w-lg rounded-xl p-4 space-y-3"
            style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-medium)" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
              Admin Update Options
            </h2>
            <p className="text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
              You can submit each token change individually, but each operation spends GAS.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
              You can also stage multiple changes and apply them together in one operation, which can reduce GAS costs.
            </p>
            <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
              Community tokens can be launched into speculation from the visible launch action on this page or from Token Administration &gt; Properties.
            </p>
            <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
              Press <strong style={{ color: "var(--forge-text-primary)" }}>OK</strong>, click anywhere, or press{" "}
              <strong style={{ color: "var(--forge-text-primary)" }}>Esc</strong> to continue.
            </p>
            <div className="pt-1">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))", color: "var(--forge-text-primary)" }}
                onClick={dismissAdminHint}
              >
                OK
              </button>
            </div>
          </section>
        </div>
      )}

      <Link href="/tokens" className="text-sm mb-6 inline-block hover:opacity-80 transition-opacity" style={{ color: "var(--forge-text-muted)" }}>
        Back to Tokens
      </Link>

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg text-sm" style={{ background: "rgba(255,82,82,0.1)", color: "var(--forge-error)", border: "1px solid rgba(255,82,82,0.3)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="rounded-xl p-4 flex items-center gap-2" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-subtle)" }}>
            <code className="text-xs font-mono flex-1 truncate" style={{ color: "var(--forge-text-muted)" }}>{contractHash}</code>
            <button aria-label="Copy contract hash" onClick={copyHash} className="text-xs px-2 py-0.5 rounded" style={{ color: copied ? "var(--forge-success)" : "var(--forge-text-muted)" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <a href={`${NEOTUBE_BASE_URL}/contract/${contractHash}`} target="_blank" rel="noopener noreferrer" aria-label="View on NeoTube" className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--forge-color-primary)" }}>
              NeoTube
            </a>
          </div>
          <div role="status" aria-label="Loading token details" className="rounded-xl p-6 animate-pulse h-48" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-subtle)" }} />
        </div>
      ) : token ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.72fr)_380px]">
          <div className="space-y-6">
            <div className="rounded-xl p-6" style={{ background: "var(--forge-bg-card)", border: `1px solid ${isOwnToken ? "var(--forge-border-own)" : "var(--forge-border-subtle)"}` }}>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-4">
                  <TokenIcon contractHash={token.contractHash} size={60} imageUrl={token.imageUrl} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h1 className="text-3xl font-bold" style={{ color: "var(--forge-text-primary)" }}>{token.symbol}</h1>
                      {isOwnToken && <span aria-label="Your token" className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(255,107,53,0.2)", color: "var(--forge-color-primary)", fontSize: "11px", fontWeight: 600 }}>Yours</span>}
                      <LockBadge locked={token.locked ?? false} />
                    </div>

                    {token.name !== token.symbol && <p className="text-sm" style={{ color: "var(--forge-text-secondary)" }}>{token.name}</p>}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: token.isNative ? "rgba(0,229,153,0.15)" : "rgba(255,107,53,0.15)", color: token.isNative ? "#00e599" : "var(--forge-color-primary)" }}>
                        {token.isNative ? "Native" : "NEP-17"}
                      </span>
                      <BurnBadge burnRate={token.burnRate ?? 0} />
                      {token.mode && <ModeBadge mode={token.mode} />}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-wrap gap-3 lg:w-auto lg:max-w-[320px] lg:justify-end">
                  {marketHref && (
                    <Link
                      href={marketHref}
                      className="inline-flex flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold lg:flex-none"
                      style={{
                        background: "rgba(255,107,53,0.14)",
                        color: "var(--forge-color-primary)",
                      }}
                    >
                      View Market
                    </Link>
                  )}
                  <button onClick={handleAddToWallet} className="inline-flex flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm lg:flex-none" style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)", background: "transparent" }}>
                    Add to NeoLine
                  </button>
                  <button onClick={handleAddToWallet} className="inline-flex flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm lg:flex-none" style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)", background: "transparent" }}>
                    Add to OneGate
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                <code className="text-xs font-mono flex-1 truncate" style={{ color: "var(--forge-text-muted)" }}>{contractHash}</code>
                <button aria-label="Copy contract hash" onClick={copyHash} className="text-xs px-2 py-0.5 rounded" style={{ color: copied ? "var(--forge-success)" : "var(--forge-text-muted)" }}>
                  {copied ? "Copied!" : "Copy"}
                </button>
                <a href={`${NEOTUBE_BASE_URL}/contract/${contractHash}`} target="_blank" rel="noopener noreferrer" aria-label="View on NeoTube" className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--forge-color-primary)" }}>
                  NeoTube
                </a>
              </div>
            </div>

            {canLaunchSpeculation && token && (
              <section
                className="rounded-xl px-6 py-5 text-center"
                style={{
                  background: "rgba(255,107,53,0.08)",
                  border: "1px solid rgba(255,107,53,0.24)",
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--forge-color-primary)" }}>
                  Speculation Launch
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
                  This token is still in Community mode. Review the market setup and publish its trading pair when you are ready.
                </p>
                <Link
                  href={`/tokens/${contractHash}/launch`}
                  className="mx-auto mt-4 inline-flex min-w-36 items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold"
                  style={{
                    background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
                    color: "var(--forge-text-primary)",
                  }}
                >
                  Launch
                </Link>
              </section>
            )}

            {isOwnToken && (
              <TokenAdminPanel token={token} factoryHash={factoryHash} onTxSubmitted={onTxSubmitted} />
            )}

            <div className="rounded-xl p-4" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-subtle)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold" style={{ color: "var(--forge-text-muted)" }}>Recent Transfers</p>
                <a href={`${NEOTUBE_BASE_URL}/contract/${contractHash}`} target="_blank" rel="noopener noreferrer" className="text-xs hover:opacity-80 transition-opacity" style={{ color: "var(--forge-color-primary)" }}>
                  View all on NeoTube
                </a>
              </div>

              {!walletAddress ? (
                <p className="text-xs py-2" style={{ color: "var(--forge-text-muted)" }}>Connect wallet to view your transfers</p>
              ) : !supported ? (
                <p className="text-xs py-2" style={{ color: "var(--forge-text-muted)" }}>Transfer history not available on this network</p>
              ) : transfers.length === 0 ? (
                <p className="text-xs py-2 leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
                  No explicit transfers found.
                </p>
              ) : (
                <div>
                  {transfers.map((tx) => (
                    <TransferRow key={`${tx.txHash}-${tx.direction}`} tx={tx} symbol={token.symbol} decimals={token.decimals} neotubeTxUrl={`${NEOTUBE_BASE_URL}/transaction/${tx.txHash}`} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <section
              className="rounded-xl p-4"
              style={{
                background: "var(--forge-bg-card)",
                border: "1px solid var(--forge-border-subtle)",
              }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
                Token Details
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <StatCard label="Supply" value={formatSupply(token.supply, token.decimals)} />
                <StatCard label="Decimals" value={token.decimals} />
                {token.creator && <StatCard label="Creator" value={truncateHash(token.creator)} />}
                {token.createdAt !== null && <StatCard label="Created" value={formatDate(token.createdAt)} />}
              </dl>
            </section>

            {economics && <TokenEconomicsPanel economics={economics} />}

            {!token.creator && (
              <section
                className="rounded-xl p-4"
                style={{
                  background: "var(--forge-bg-card)",
                  border: "1px solid var(--forge-border-subtle)",
                }}
              >
                <p className="text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
                  Not registered via Forge.
                </p>
              </section>
            )}
          </aside>
        </div>
      ) : (
        <div className="rounded-xl p-4 flex items-center gap-2" style={{ background: "var(--forge-bg-card)", border: "1px solid var(--forge-border-subtle)" }}>
          <code className="text-xs font-mono flex-1 truncate" style={{ color: "var(--forge-text-muted)" }}>{contractHash}</code>
          <button aria-label="Copy contract hash" onClick={copyHash} className="text-xs px-2 py-0.5 rounded" style={{ color: copied ? "var(--forge-success)" : "var(--forge-text-muted)" }}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <a href={`${NEOTUBE_BASE_URL}/contract/${contractHash}`} target="_blank" rel="noopener noreferrer" aria-label="View on NeoTube" className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--forge-color-primary)" }}>
            NeoTube
          </a>
        </div>
      )}
    </div>
  );
}
