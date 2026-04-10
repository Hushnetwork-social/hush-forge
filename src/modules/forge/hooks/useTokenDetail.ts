"use client";

/**
 * useTokenDetail loads full token metadata for a given contract hash.
 *
 * isOwnToken first checks the token store's ownTokenHashes set (populated when
 * the user loads the /tokens list). It then falls back to direct creator-vs-
 * address comparison so directly loaded token pages still recognize creator
 * ownership. For compatibility, the fallback compares both the canonical
 * script hash form and the legacy reversed-byte form derived from the
 * connected wallet address.
 */

import { useEffect, useState } from "react";
import { resolveTokenMetadata } from "../token-metadata-service";
import { addressToHash160 } from "../neo-rpc-client";
import { getTokenEconomicsView } from "../token-economics-logic";
import { useWalletStore } from "../wallet-store";
import { useTokenStore } from "../token-store";
import type { TokenEconomicsView, TokenInfo } from "../types";

export interface TokenDetailResult {
  token: TokenInfo | null;
  economics: TokenEconomicsView | null;
  loading: boolean;
  error: string | null;
  isOwnToken: boolean;
  isUpgradeable: boolean;
}

function addressToHashForms(address: string): {
  canonical: string | null;
  reversedLegacy: string | null;
} {
  try {
    const canonical = addressToHash160(address);
    const body = canonical.slice(2);
    return {
      canonical,
      reversedLegacy: "0x" + (body.match(/.{2}/g) ?? []).reverse().join(""),
    };
  } catch {
    return { canonical: null, reversedLegacy: null };
  }
}

export function useTokenDetail(contractHash: string): TokenDetailResult {
  const address = useWalletStore((s) => s.address);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  const ownTokenHashes = useTokenStore((s) => s.ownTokenHashes);

  const [token, setToken] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    resolveTokenMetadata(contractHash)
      .then((resolvedToken) => {
        if (!cancelled) {
          setToken(resolvedToken);
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
  }, [contractHash, address, connectionStatus]);

  const comparableCreatorHashes = address
    ? addressToHashForms(address)
    : { canonical: null, reversedLegacy: null };

  const isOwnToken =
    ownTokenHashes.has(contractHash) ||
    (!!token?.creator &&
      !!address &&
      (token.creator === address ||
        token.creator === comparableCreatorHashes.canonical ||
        token.creator === comparableCreatorHashes.reversedLegacy));

  return {
    token,
    economics: getTokenEconomicsView(token),
    loading,
    error,
    isOwnToken,
    isUpgradeable: token?.mode === "community",
  };
}
