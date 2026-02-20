/**
 * useTokenTransfers — fetches the most recent NEP-17 transfers for a specific
 * token from the connected wallet's history.
 *
 * Requires the RpcNep17Tracker plugin on the Neo node.
 * Sets `supported = false` when the node does not have the plugin.
 *
 * IMPORTANT: `getnep17transfers` only tracks explicit NEP-17 Transfer
 * notifications. GAS system fees paid during contract deployment / execution
 * are processed at the native-contract level and are NOT emitted as Transfer
 * events — they will NOT appear here. Use NeoTube for full fee history.
 */

import { useState, useEffect } from "react";
import { getNep17Transfers } from "../neo-rpc-client";

export interface TokenTransfer {
  timestamp: number;
  txHash: string;
  blockIndex: number;
  /** The other party — null means minted (in) or fee burn (out). */
  counterparty: string | null;
  amount: bigint;
  direction: "in" | "out";
}

export interface UseTokenTransfersResult {
  transfers: TokenTransfer[];
  loading: boolean;
  error: string | null;
  /** false when the Neo node does not expose getnep17transfers */
  supported: boolean;
}

/**
 * Normalise a contract hash for comparison:
 * strips the optional "0x" prefix and lowercases.
 * This makes the filter robust regardless of whether the RPC response
 * includes or omits the prefix.
 */
function normalizeHash(hash: string): string {
  return hash.toLowerCase().replace(/^0x/, "");
}

export function useTokenTransfers(
  contractHash: string,
  walletAddress: string | null
): UseTokenTransfersResult {
  const [transfers, setTransfers] = useState<TokenTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!walletAddress) {
      setTransfers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getNep17Transfers(walletAddress)
      .then((result) => {
        if (cancelled) return;

        const targetHash = normalizeHash(contractHash);

        const received: TokenTransfer[] = (result.received ?? [])
          .filter((t) => normalizeHash(t.asset_hash) === targetHash)
          .map((t) => ({
            timestamp: t.timestamp,
            txHash: t.tx_hash,
            blockIndex: t.block_index,
            counterparty: t.transfer_address,
            amount: BigInt(t.amount),
            direction: "in" as const,
          }));

        const sent: TokenTransfer[] = (result.sent ?? [])
          .filter((t) => normalizeHash(t.asset_hash) === targetHash)
          .map((t) => ({
            timestamp: t.timestamp,
            txHash: t.tx_hash,
            blockIndex: t.block_index,
            counterparty: t.transfer_address,
            amount: BigInt(t.amount),
            direction: "out" as const,
          }));

        const all = [...received, ...sent]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5);

        setTransfers(all);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Detect "method not available" in various forms:
        // -32601 = JSON-RPC "Method not found" code
        // Some nodes return different phrasing
        const isUnsupported =
          msg.includes("Method not found") ||
          msg.includes("method not found") ||
          msg.includes("No such method") ||
          msg.includes("-32601");
        if (isUnsupported) {
          setSupported(false);
        } else {
          setError(msg);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contractHash, walletAddress]);

  return { transfers, loading, error, supported };
}
