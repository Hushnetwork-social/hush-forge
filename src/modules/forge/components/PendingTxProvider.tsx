"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ForgeErrorToast, ForgePendingToast } from "./ForgeToaster";
import { useTokenPolling } from "../hooks/useTokenPolling";
import { dispatchMarketDataInvalidated } from "../market-data-events";
import { persistMarketLaunchSummary } from "../market-launch-banner-state";
import type { MarketLaunchSummary, TxStatus } from "../types";
import { useWalletStore } from "../wallet-store";

const STORAGE_KEY = "forge.pending.tx";

type PendingTxState = {
  txHash: string;
  message: string;
  targetTokenHash?: string;
  redirectPath?: string;
  marketLaunchSummary?: MarketLaunchSummary;
};

type PendingTxContextValue = {
  setPendingTx: (pending: PendingTxState) => void;
  clearPendingTx: () => void;
  pendingTx: PendingTxState | null;
  pendingStatus: TxStatus | null;
};

const noop = () => {};

const PendingTxContext = createContext<PendingTxContextValue>({
  setPendingTx: noop,
  clearPendingTx: noop,
  pendingTx: null,
  pendingStatus: null,
});

export function usePendingTx() {
  return useContext(PendingTxContext);
}

export function PendingTxProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [pending, setPending] = useState<PendingTxState | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingTxState;
      if (typeof parsed.txHash !== "string" || parsed.txHash.length === 0) {
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });
  const [visible, setVisible] = useState(() => pending !== null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const polling = useTokenPolling(pending?.txHash ?? null);

  useEffect(() => {
    if (!pending) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    if (polling.status === "confirmed") {
      const confirmedHash = pending.targetTokenHash ?? polling.contractHash ?? "";
      if (pending.marketLaunchSummary) {
        persistMarketLaunchSummary(pending.marketLaunchSummary);
      }
      if (pending.redirectPath) {
        if (pathname === pending.redirectPath) {
          window.location.reload();
        } else {
          router.push(pending.redirectPath);
        }
        queueMicrotask(() => setPending(null));
        return;
      }
      const isTokensList = pathname === "/tokens";
      const isSameTokenDetail = confirmedHash.length > 0 && pathname === `/tokens/${confirmedHash}`;
      const isMarketsList = pathname === "/markets";
      const isSameMarketDetail = confirmedHash.length > 0 && pathname === `/markets/${confirmedHash}`;
      if (isSameMarketDetail) {
        dispatchMarketDataInvalidated(confirmedHash, "trade_confirmation");
        void useWalletStore.getState().refreshBalances();
      } else if (isTokensList || isSameTokenDetail || isMarketsList) {
        window.location.reload();
      }
      queueMicrotask(() => setPending(null));
      return;
    }
    if (polling.status === "faulted") {
      queueMicrotask(() => {
        setErrorMessage(polling.error ?? "Transaction failed.");
        setPending(null);
      });
    }
  }, [pathname, pending, polling.contractHash, polling.error, polling.status, router]);

  const value = useMemo<PendingTxContextValue>(
    () => ({
      setPendingTx(nextPending) {
        setErrorMessage(null);
        setPending(nextPending);
        setVisible(true);
      },
      clearPendingTx() {
        setPending(null);
      },
      pendingTx: pending,
      pendingStatus: pending ? polling.status : null,
    }),
    [pending, polling.status]
  );

  return (
    <PendingTxContext.Provider value={value}>
      {children}

      {pending &&
        visible &&
        (polling.status === "pending" || polling.status === "confirming") && (
          <ForgePendingToast
            txHash={pending.txHash}
            status={polling.status}
            message={pending.message}
            onDismiss={() => setVisible(false)}
          />
        )}

      {errorMessage && (
        <ForgeErrorToast
          message={errorMessage}
          txHash={pending?.txHash}
          onDismiss={() => setErrorMessage(null)}
        />
      )}
    </PendingTxContext.Provider>
  );
}
