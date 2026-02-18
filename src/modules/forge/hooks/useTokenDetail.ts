/**
 * useTokenDetail — Loads and provides full token metadata for a given contract hash.
 * Uses the factory + RPC fallback chain from TokenMetadataService.
 * Derives isOwnToken by comparing token.creator with the connected wallet address.
 * isUpgradeable is a placeholder (always false) until TokenTemplate exposes the field.
 */

import { useEffect, useState } from "react";
import { resolveTokenMetadata } from "../token-metadata-service";
import { useWalletStore } from "../wallet-store";
import type { TokenInfo } from "../types";

export interface TokenDetailResult {
  token: TokenInfo | null;
  loading: boolean;
  error: string | null;
  isOwnToken: boolean;
  isUpgradeable: boolean;
}

export function useTokenDetail(contractHash: string): TokenDetailResult {
  const address = useWalletStore((s) => s.address);

  const [token, setToken] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    resolveTokenMetadata(contractHash)
      .then((t) => {
        if (!cancelled) {
          setToken(t);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contractHash]);

  const isOwnToken =
    !!token?.creator && !!address && token.creator === address;

  return {
    token,
    loading,
    error,
    isOwnToken,
    isUpgradeable: false, // placeholder — update when TokenTemplate exposes upgradeable flag
  };
}
