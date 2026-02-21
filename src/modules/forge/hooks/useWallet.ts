/**
 * useWallet — Provides wallet state and actions to React components.
 * Detects installed wallets once on mount and calls tryAutoReconnect() once on first mount.
 * Also calls tryAutoReconnect() when NEOLine:DomReady fires, so that if the first attempt
 * failed because NeoLine hadn't injected yet, it retries automatically.
 */

import { useEffect, useMemo, useState } from "react";
import { GAS_CONTRACT_HASH } from "../forge-config";
import {
  detectInstalledWallets,
  type InstalledWallet,
} from "../neo-dapi-adapter";
import { useWalletStore } from "../wallet-store";

export function useWallet() {
  const walletType = useWalletStore((s) => s.walletType);
  const address = useWalletStore((s) => s.address);
  const balances = useWalletStore((s) => s.balances);
  const connectionStatus = useWalletStore((s) => s.connectionStatus);
  const errorMessage = useWalletStore((s) => s.errorMessage);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);
  const tryAutoReconnect = useWalletStore((s) => s.tryAutoReconnect);

  const [installedWallets, setInstalledWallets] = useState<InstalledWallet[]>(
    []
  );

  // Detect installed wallets and attempt auto-reconnect once on first mount.
  // NeoLine injects window.NEOLineN3 asynchronously. The "NEOLine:DomReady" event
  // may fire before React hydrates (missed) or on document instead of window.
  // We cover all cases: event listeners on both targets + timeout fallbacks.
  useEffect(() => {
    function detectAndSet() {
      setInstalledWallets(detectInstalledWallets());
    }

    detectAndSet();
    void tryAutoReconnect();

    // When NeoLine injects, detect wallets AND retry auto-reconnect.
    // This covers the case where tryAutoReconnect() above ran before NeoLine
    // was ready (WalletNotConnectedError) — localStorage is preserved so retry works.
    function onNeoLineReady() {
      detectAndSet();
      void tryAutoReconnect();
    }
    window.addEventListener("NEOLine:DomReady", onNeoLineReady);
    document.addEventListener("NEOLine:DomReady", onNeoLineReady);

    // Fallback polls in case the event fired before our listeners attached.
    // Each timeout also calls tryAutoReconnect() so that if NeoLine injected
    // between the initial call (which may have failed) and this timeout, the
    // wallet reconnects automatically without waiting for user interaction.
    const tryReconnect = () => { detectAndSet(); void tryAutoReconnect(); };
    const t1 = setTimeout(tryReconnect, 100);
    const t2 = setTimeout(tryReconnect, 500);
    const t3 = setTimeout(tryReconnect, 1500);

    return () => {
      window.removeEventListener("NEOLine:DomReady", onNeoLineReady);
      document.removeEventListener("NEOLine:DomReady", onNeoLineReady);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive GAS balance (bigint) from the balances array
  const gasBalance = useMemo(() => {
    const entry = balances.find((b) => b.contractHash === GAS_CONTRACT_HASH);
    return entry?.amount ?? 0n;
  }, [balances]);

  return {
    walletType,
    address,
    balances,
    connectionStatus,
    errorMessage,
    installedWallets,
    gasBalance,
    connect,
    disconnect,
    refreshBalances,
  };
}
