/**
 * TokenStore — Zustand store for the token list.
 * Manages all tokens visible to the connected user, derived "own tokens" state,
 * filter state, and loading state. Own tokens always appear before non-own tokens.
 */

import { create } from "zustand";
import { getRuntimeFactoryHash } from "./forge-config";
import {
  addressToHash160,
  getAllFactoryTokenHashes,
  invokeFunction,
} from "./neo-rpc-client";
import { resolveTokenMetadata } from "./token-metadata-service";
import type { RpcStackItem, TokenInfo, WalletBalance } from "./types";

// ---------------------------------------------------------------------------
// State and actions
// ---------------------------------------------------------------------------

export type LoadingStatus = "idle" | "loading" | "loaded" | "error";
export type TabType = "all" | "mine" | "new" | "community" | "speculative" | "crowdfund";

interface TokenState {
  tokens: TokenInfo[];
  ownTokenHashes: Set<string>;
  activeTab: TabType;
  searchQuery: string;
  loadingStatus: LoadingStatus;
  errorMessage: string | null;
}

interface TokenActions {
  loadTokensForAddress(address: string): Promise<void>;
  loadWalletHeldTokens(balances: WalletBalance[]): Promise<void>;
  addToken(token: TokenInfo): void;
  setActiveTab(tab: TabType): void;
  setSearchQuery(query: string): void;
  reset(): void;
}

export type TokenStore = TokenState & TokenActions;

// ---------------------------------------------------------------------------
// Selector for derived display list (own tokens first)
// ---------------------------------------------------------------------------

export function selectDisplayTokens(state: {
  tokens: TokenInfo[];
  ownTokenHashes: Set<string>;
  activeTab: TabType;
  searchQuery: string;
}): TokenInfo[] {
  let filtered = state.tokens;

  // 1. Tab filter
  switch (state.activeTab) {
    case "all":
      // No filter — show everything
      break;
    case "mine":
      filtered = filtered.filter((t) => state.ownTokenHashes.has(t.contractHash));
      break;
    case "new":
      // Forge-created tokens only (exclude native NEO/GAS)
      filtered = filtered.filter((t) => !t.isNative && t.createdAt !== null);
      break;
    case "community":
      filtered = filtered.filter((t) => t.mode === "community");
      break;
    case "speculative":
      filtered = filtered.filter((t) => t.mode === "speculative");
      break;
    case "crowdfund":
      filtered = filtered.filter((t) => t.mode === "crowdfund");
      break;
  }

  // 2. Search filter (contractHash, symbol, name, mode)
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (t) =>
        t.contractHash.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.mode && t.mode.toLowerCase().includes(q))
    );
  }

  // 3. Sort/order
  if (state.activeTab === "new") {
    // Newest first (all results have createdAt — native excluded above)
    return [...filtered].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  // All other tabs: own tokens first
  const own = filtered.filter((t) => state.ownTokenHashes.has(t.contractHash));
  const others = filtered.filter((t) => !state.ownTokenHashes.has(t.contractHash));
  return [...own, ...others];
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
  activeTab: "all",
  searchQuery: "",
  loadingStatus: "idle",
  errorMessage: null,
};

export const useTokenStore = create<TokenStore>()((set, get) => ({
  ...INITIAL_STATE,

  async loadTokensForAddress(address: string) {
    set({ loadingStatus: "loading", errorMessage: null });
    try {
      const factoryHash = getRuntimeFactoryHash();

      // 1. Load ALL tokens registered in the Forge factory (global list).
      //    Uses findstorage on Prefix_GlobalTokenList (0x02) — no indexer needed.
      const allHashes = await getAllFactoryTokenHashes(factoryHash);
      const allTokens = await Promise.all(allHashes.map(resolveTokenMetadata));

      // 2. Separately determine which tokens were CREATED by this address so we
      //    can show the "Yours" badge without limiting the global list.
      let ownTokenHashes = new Set<string>();
      try {
        const creatorResult = await invokeFunction(
          factoryHash,
          "getTokensByCreator",
          [
            { type: "Hash160", value: addressToHash160(address) },
            { type: "Integer", value: "0" },
            { type: "Integer", value: "100" },
          ]
        );
        ownTokenHashes = new Set(parseHashList(creatorResult));
      } catch {
        // Non-critical — own-token detection failed, badges just won't show
      }

      // 3. Merge: keep native tokens (NEO/GAS) already added by loadWalletHeldTokens.
      const factoryHashSet = new Set(allTokens.map((t) => t.contractHash));
      set((state) => {
        const retained = state.tokens.filter(
          (t) => !factoryHashSet.has(t.contractHash)
        );
        return {
          tokens: [...allTokens, ...retained],
          ownTokenHashes,
          loadingStatus: "loaded",
        };
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      set({ loadingStatus: "error", errorMessage });
    }
  },

  async loadWalletHeldTokens(balances: WalletBalance[]) {
    // The wallet (NeoLine) reports authoritative decimals for each token.
    // Keep a map so we can patch store tokens that landed with decimals=0
    // (which happens when the decimals() RPC call failed concurrently).
    const walletDecimals = new Map(balances.map((b) => [b.contractHash, b.decimals]));

    // Resolve metadata for all balances. Deduplication happens at write time
    // (inside the setter) to avoid a race with loadTokensForAddress.
    try {
      const resolved = await Promise.all(
        balances.map(async (b) => {
          const meta = await resolveTokenMetadata(b.contractHash);
          // Prefer RPC decimals; fall back to wallet-reported when RPC returned 0.
          // Native tokens (NEO/GAS) have authoritative decimals from our static spec
          // even when they are 0. Non-native: prefer RPC-resolved; fall back to
          // wallet-reported when RPC returned 0 (decimals() call failed).
          const decimals =
            meta.isNative || meta.decimals > 0 ? meta.decimals : b.decimals;
          // When RPC metadata resolution fails the stub has an empty symbol.
          // Fall back to the wallet balance data so the card always shows something.
          const symbol = meta.symbol || b.symbol;
          return { ...meta, symbol, decimals };
        })
      );

      set((state) => {
        // 1. Patch existing tokens whose decimals landed as 0 (RPC race failure).
        //    The wallet's reported decimals are authoritative.
        const patched = state.tokens.map((t) => {
          const walletDec = walletDecimals.get(t.contractHash);
          if (t.decimals === 0 && walletDec && walletDec > 0) {
            return { ...t, decimals: walletDec };
          }
          return t;
        });

        // 2. Add tokens not yet in the store.
        const existingHashes = new Set(patched.map((t) => t.contractHash));
        const newTokens = resolved.filter((t) => !existingHashes.has(t.contractHash));

        if (newTokens.length === 0 && patched.every((t, i) => t === state.tokens[i])) {
          return state; // nothing changed — skip re-render
        }
        return { tokens: [...patched, ...newTokens] };
      });
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

  setActiveTab(tab: TabType) {
    set({ activeTab: tab });
  },

  setSearchQuery(query: string) {
    set({ searchQuery: query });
  },

  reset() {
    set({ ...INITIAL_STATE, ownTokenHashes: new Set() });
  },
}));
