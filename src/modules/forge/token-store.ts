/**
 * TokenStore — Zustand store for the token list.
 * Manages all tokens visible to the connected user, derived "own tokens" state,
 * filter state, and loading state. Own tokens always appear before non-own tokens.
 */

import { create } from "zustand";
import { FACTORY_CONTRACT_HASH } from "./forge-config";
import { invokeFunction } from "./neo-rpc-client";
import { resolveTokenMetadata } from "./token-metadata-service";
import type { RpcStackItem, TokenInfo, WalletBalance } from "./types";

// ---------------------------------------------------------------------------
// State and actions
// ---------------------------------------------------------------------------

export type LoadingStatus = "idle" | "loading" | "loaded" | "error";

interface TokenState {
  tokens: TokenInfo[];
  ownTokenHashes: Set<string>;
  filterMyTokens: boolean;
  loadingStatus: LoadingStatus;
  errorMessage: string | null;
}

interface TokenActions {
  loadTokensForAddress(address: string): Promise<void>;
  loadWalletHeldTokens(balances: WalletBalance[]): Promise<void>;
  addToken(token: TokenInfo): void;
  setFilterMyTokens(value: boolean): void;
  reset(): void;
}

export type TokenStore = TokenState & TokenActions;

// ---------------------------------------------------------------------------
// Selector for derived display list (own tokens first)
// ---------------------------------------------------------------------------

export function selectDisplayTokens(state: {
  tokens: TokenInfo[];
  ownTokenHashes: Set<string>;
  filterMyTokens: boolean;
}): TokenInfo[] {
  const own = state.tokens.filter((t) =>
    state.ownTokenHashes.has(t.contractHash)
  );
  const others = state.tokens.filter(
    (t) => !state.ownTokenHashes.has(t.contractHash)
  );
  return state.filterMyTokens ? own : [...own, ...others];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parses the Array of ByteString hashes returned by GetTokensByCreator. */
function parseHashList(result: { stack: RpcStackItem[] }): string[] {
  const item = result.stack[0];
  if (!item || item.type !== "Array") return [];

  const items = item.value as RpcStackItem[];
  return items.flatMap((entry) => {
    if (entry.type !== "ByteString" && entry.type !== "ByteArray") return [];
    const bytes = Uint8Array.from(
      atob(entry.value as string),
      (c) => c.charCodeAt(0)
    );
    const hex = [...bytes]
      .reverse()
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return [`0x${hex}`];
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const INITIAL_STATE: TokenState = {
  tokens: [],
  ownTokenHashes: new Set(),
  filterMyTokens: false,
  loadingStatus: "idle",
  errorMessage: null,
};

export const useTokenStore = create<TokenStore>()((set, get) => ({
  ...INITIAL_STATE,

  async loadTokensForAddress(address: string) {
    set({ loadingStatus: "loading", errorMessage: null });
    try {
      const result = await invokeFunction(
        FACTORY_CONTRACT_HASH,
        "GetTokensByCreator",
        [{ type: "Hash160", value: address }]
      );

      const hashes = parseHashList(result);
      const tokens = await Promise.all(hashes.map(resolveTokenMetadata));
      const ownTokenHashes = new Set(tokens.map((t) => t.contractHash));

      set({ tokens, ownTokenHashes, loadingStatus: "loaded" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      set({ loadingStatus: "error", errorMessage });
    }
  },

  async loadWalletHeldTokens(balances: WalletBalance[]) {
    const { tokens } = get();
    const existingHashes = new Set(tokens.map((t) => t.contractHash));

    const newHashes = balances
      .map((b) => b.contractHash)
      .filter((h) => !existingHashes.has(h));

    if (newHashes.length === 0) return;

    try {
      const newTokens = await Promise.all(newHashes.map(resolveTokenMetadata));
      set((state) => ({ tokens: [...state.tokens, ...newTokens] }));
    } catch {
      // Non-critical — wallet balance enrichment failure is silent
    }
  },

  addToken(token: TokenInfo) {
    set((state) => ({
      tokens: [token, ...state.tokens],
      ownTokenHashes: new Set([...state.ownTokenHashes, token.contractHash]),
    }));
  },

  setFilterMyTokens(value: boolean) {
    set({ filterMyTokens: value });
  },

  reset() {
    set({ ...INITIAL_STATE, ownTokenHashes: new Set() });
  },
}));
