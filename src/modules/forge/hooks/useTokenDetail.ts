/**
 * useTokenDetail — Loads and provides full token metadata for a given contract hash.
 * Uses the factory + RPC fallback chain from TokenMetadataService.
 *
 * isOwnToken: first checks the token store's ownTokenHashes set (populated when the
 * user loads the /tokens list). Falls back to direct creator-vs-address comparison,
 * which handles the case where the user navigates directly to a detail page.
 * The fallback converts the base58 address to big-endian hex to match the format
 * returned by decodeHash() in token-metadata-service.
 *
 * isUpgradeable is true when the token was created in "community" mode — community
 * tokens are managed by the factory and can be updated via the UpdateOverlay.
 */

import { useEffect, useState } from "react";
import { resolveTokenMetadata } from "../token-metadata-service";
import { addressToHash160 } from "../neo-rpc-client";
import { useWalletStore } from "../wallet-store";
import { useTokenStore } from "../token-store";
import type { TokenInfo } from "../types";

export interface TokenDetailResult {
  token: TokenInfo | null;
  loading: boolean;
  error: string | null;
  isOwnToken: boolean;
  isUpgradeable: boolean;
}

/**
 * Converts a base58 Neo address to big-endian 0x-prefixed hex.
 * token.creator is stored in big-endian hex (by decodeHash() in token-metadata-service);
 * addressToHash160() returns little-endian hex — we reverse here to match.
 * Returns null on any conversion error (e.g. synthetic test-fixture strings).
 */
function addressToBEHash(address: string): string | null {
  try {
    const le = addressToHash160(address).slice(2); // strip "0x"
    return "0x" + (le.match(/.{2}/g) ?? []).reverse().join("");
  } catch {
    return null;
  }
}

export function useTokenDetail(contractHash: string): TokenDetailResult {
  const address = useWalletStore((s) => s.address);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  // ownTokenHashes is populated by loadTokensForAddress() when the user visits /tokens.
  // Using it as the primary isOwnToken signal avoids address-format mismatch issues.
  const ownTokenHashes = useTokenStore((s) => s.ownTokenHashes);

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
  }, [contractHash, address, connectionStatus]);

  // Primary: check the token store's set (populated when user browses the list).
  // Fallback: compare creator hash with the connected wallet's address.
  const isOwnToken =
    ownTokenHashes.has(contractHash) ||
    (!!token?.creator &&
      !!address &&
      (token.creator === address ||
        token.creator === addressToBEHash(address)));

  return {
    token,
    loading,
    error,
    isOwnToken,
    isUpgradeable: token?.mode === "community",
  };
}
