"use client";

/**
 * useTokenDetail loads full token metadata for a given contract hash.
 *
 * isOwnToken first checks the token store's ownTokenHashes set (populated when
 * the user loads the /tokens list). It then falls back to direct creator-vs-
 * address comparison so directly loaded token pages still recognize creator
 * ownership. For compatibility, the fallback compares both little-endian and
 * big-endian hash forms derived from the connected wallet address.
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

function addressToHashForms(address: string): { le: string | null; be: string | null } {
  try {
    const le = addressToHash160(address);
    const body = le.slice(2);
    return {
      le,
      be: "0x" + (body.match(/.{2}/g) ?? []).reverse().join(""),
    };
  } catch {
    return { le: null, be: null };
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
    : { le: null, be: null };

  const isOwnToken =
    ownTokenHashes.has(contractHash) ||
    (!!token?.creator &&
      !!address &&
      (token.creator === address ||
        token.creator === comparableCreatorHashes.le ||
        token.creator === comparableCreatorHashes.be));

  return {
    token,
    economics: getTokenEconomicsView(token),
    loading,
    error,
    isOwnToken,
    isUpgradeable: token?.mode === "community",
  };
}
