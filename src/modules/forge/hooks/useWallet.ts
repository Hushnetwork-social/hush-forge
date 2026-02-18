/**
 * useWallet — Provides wallet state and actions to React components.
 * Detects installed wallets once on mount and calls tryAutoReconnect() once on first mount.
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

  // Detect installed wallets and attempt auto-reconnect once on first mount
  useEffect(() => {
    setInstalledWallets(detectInstalledWallets());
    void tryAutoReconnect();
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
