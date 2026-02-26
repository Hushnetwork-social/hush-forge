"use client";

import { useState } from "react";
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

interface Props {
  contractHash: string;
  onTxSubmitted: (txHash: string, message: string) => void;
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
  return new Date(timestamp * 1000).toLocaleDateString();
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
  const { token, loading, error, isOwnToken } = useTokenDetail(contractHash);
  const walletAddress = useWalletStore((s) => s.address);
  const { transfers, supported } = useTokenTransfers(contractHash, walletAddress);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="max-w-2xl mx-auto p-6">
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
        <div className="space-y-4">
          <div className="rounded-xl p-6" style={{ background: "var(--forge-bg-card)", border: `1px solid ${isOwnToken ? "var(--forge-border-own)" : "var(--forge-border-subtle)"}` }}>
            <div className="flex items-center gap-4 mb-5">
              <TokenIcon contractHash={token.contractHash} size={60} imageUrl={token.imageUrl} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-3xl font-bold" style={{ color: "var(--forge-text-primary)" }}>{token.symbol}</h1>
                  {isOwnToken && <span aria-label="Your token" className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(255,107,53,0.2)", color: "var(--forge-color-primary)", fontSize: "11px", fontWeight: 600 }}>Yours</span>}
                  <LockBadge locked={token.locked ?? false} />
                </div>

                {token.name !== token.symbol && <p className="text-sm" style={{ color: "var(--forge-text-secondary)" }}>{token.name}</p>}

                <div className="flex items-center justify-between mt-2 gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: token.isNative ? "rgba(0,229,153,0.15)" : "rgba(255,107,53,0.15)", color: token.isNative ? "#00e599" : "var(--forge-color-primary)" }}>
                    {token.isNative ? "Native" : "NEP-17"}
                  </span>
                  <div className="flex items-center gap-2">
                    <BurnBadge burnRate={token.burnRate ?? 0} />
                    {token.mode && <ModeBadge mode={token.mode} />}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
              <code className="text-xs font-mono flex-1 truncate" style={{ color: "var(--forge-text-muted)" }}>{contractHash}</code>
              <button aria-label="Copy contract hash" onClick={copyHash} className="text-xs px-2 py-0.5 rounded" style={{ color: copied ? "var(--forge-success)" : "var(--forge-text-muted)" }}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <a href={`${NEOTUBE_BASE_URL}/contract/${contractHash}`} target="_blank" rel="noopener noreferrer" aria-label="View on NeoTube" className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--forge-color-primary)" }}>
                NeoTube
              </a>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <StatCard label="Supply" value={formatSupply(token.supply, token.decimals)} />
            <StatCard label="Decimals" value={token.decimals} />
            {token.creator && <StatCard label="Creator" value={truncateHash(token.creator)} />}
            {token.createdAt !== null && <StatCard label="Created" value={formatDate(token.createdAt)} />}
          </dl>

          {!token.creator && <p className="text-xs px-1" style={{ color: "var(--forge-text-muted)" }}>Not registered via Forge</p>}

          <div className="flex flex-wrap gap-3">
            <button onClick={handleAddToWallet} className="px-4 py-2 rounded-lg text-sm" style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)", background: "transparent" }}>
              Add to NeoLine
            </button>
            <button onClick={handleAddToWallet} className="px-4 py-2 rounded-lg text-sm" style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)", background: "transparent" }}>
              Add to OneGate
            </button>
          </div>

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