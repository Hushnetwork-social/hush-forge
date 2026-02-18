/**
 * WalletStore — Zustand store for wallet connection state.
 * Wraps the dAPI adapter with UI-friendly state management and localStorage
 * persistence. Components only interact with this store, never the adapter directly.
 */

import { create } from "zustand";
import { WALLET_STORAGE_KEY } from "./forge-config";
import {
  connect as dapiConnect,
  disconnect as dapiDisconnect,
  getBalances as dapiGetBalances,
} from "./neo-dapi-adapter";
import type { WalletBalance, WalletType } from "./types";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface WalletState {
  walletType: WalletType | null;
  address: string | null;
  balances: WalletBalance[];
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
}

interface WalletActions {
  connect(walletType: WalletType): Promise<void>;
  disconnect(): void;
  refreshBalances(): Promise<void>;
  tryAutoReconnect(): Promise<void>;
}

export type WalletStore = WalletState & WalletActions;

export const WALLET_INITIAL_STATE: WalletState = {
  walletType: null,
  address: null,
  balances: [],
  connectionStatus: "disconnected",
  errorMessage: null,
};

export const useWalletStore = create<WalletStore>()((set, get) => ({
  ...WALLET_INITIAL_STATE,

  async connect(walletType: WalletType) {
    set({ connectionStatus: "connecting", errorMessage: null });
    try {
      const address = await dapiConnect(walletType);
      const balances = await dapiGetBalances(address);
      set({ walletType, address, balances, connectionStatus: "connected" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      set({
        connectionStatus: "error",
        errorMessage,
        walletType: null,
        address: null,
        balances: [],
      });
    }
  },

  disconnect() {
    dapiDisconnect();
    set({ ...WALLET_INITIAL_STATE });
  },

  async refreshBalances() {
    const { address } = get();
    if (!address) return;
    try {
      const balances = await dapiGetBalances(address);
      set({ balances });
    } catch {
      // Non-critical — keep existing balances on RPC failure
    }
  },

  async tryAutoReconnect() {
    if (typeof localStorage === "undefined") return;
    const saved = localStorage.getItem(WALLET_STORAGE_KEY) as WalletType | null;
    if (!saved || saved === "disconnected") return;

    set({ connectionStatus: "connecting" });
    try {
      const address = await dapiConnect(saved);
      const balances = await dapiGetBalances(address);
      set({
        walletType: saved,
        address,
        balances,
        connectionStatus: "connected",
        errorMessage: null,
      });
    } catch {
      // Silent failure — clear stale storage and stay disconnected
      localStorage.removeItem(WALLET_STORAGE_KEY);
      set({ connectionStatus: "disconnected" });
    }
  },
}));
