/**
 * WalletStore — Zustand store for wallet connection state.
 * Wraps the dAPI adapter with UI-friendly state management and localStorage
 * persistence. Components only interact with this store, never the adapter directly.
 */

import { create } from "zustand";
import { WALLET_ADDRESS_STORAGE_KEY, WALLET_STORAGE_KEY } from "./forge-config";
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
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(WALLET_STORAGE_KEY, walletType);
        localStorage.setItem(WALLET_ADDRESS_STORAGE_KEY, address);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[wallet-store] connect failed:", err);
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
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(WALLET_STORAGE_KEY);
      localStorage.removeItem(WALLET_ADDRESS_STORAGE_KEY);
    }
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
    // Already connected or connecting — nothing to do
    const { connectionStatus } = get();
    if (connectionStatus === "connected" || connectionStatus === "connecting") return;

    const savedAddress = localStorage.getItem(WALLET_ADDRESS_STORAGE_KEY);

    set({ connectionStatus: "connecting" });
    try {
      const address = await dapiConnect(saved);

      // If the wallet's active account has changed since the last explicit
      // connect, do NOT silently reconnect as a different account. Clear the
      // saved state and stay disconnected so the user can connect manually.
      if (savedAddress && address !== savedAddress) {
        console.warn(
          "[wallet-store] auto-reconnect: wallet account changed",
          savedAddress, "→", address,
          "— staying disconnected"
        );
        dapiDisconnect();
        localStorage.removeItem(WALLET_STORAGE_KEY);
        localStorage.removeItem(WALLET_ADDRESS_STORAGE_KEY);
        set({ connectionStatus: "disconnected" });
        return;
      }

      const balances = await dapiGetBalances(address);
      set({
        walletType: saved,
        address,
        balances,
        connectionStatus: "connected",
        errorMessage: null,
      });
    } catch (err) {
      // If the wallet extension isn't injected yet (WalletNotConnectedError),
      // keep localStorage so that when NEOLine:DomReady fires and tryAutoReconnect()
      // is called again, it can succeed. Only clear storage for genuine auth failures.
      const isInjectionNotReady = err instanceof Error && err.name === "WalletNotConnectedError";
      if (!isInjectionNotReady) {
        localStorage.removeItem(WALLET_STORAGE_KEY);
        localStorage.removeItem(WALLET_ADDRESS_STORAGE_KEY);
      }
      set({ connectionStatus: "disconnected" });
    }
  },
}));
