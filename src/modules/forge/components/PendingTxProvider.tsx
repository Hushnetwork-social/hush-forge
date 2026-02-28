"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ForgeErrorToast, ForgePendingToast } from "./ForgeToaster";
import { useTokenPolling } from "../hooks/useTokenPolling";

const STORAGE_KEY = "forge.pending.tx";

type PendingTxState = {
  txHash: string;
  message: string;
  targetTokenHash?: string;
};

type PendingTxContextValue = {
  setPendingTx: (pending: PendingTxState) => void;
  clearPendingTx: () => void;
};

const noop = () => {};

const PendingTxContext = createContext<PendingTxContextValue>({
  setPendingTx: noop,
  clearPendingTx: noop,
});

export function usePendingTx() {
  return useContext(PendingTxContext);
}

export function PendingTxProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [pending, setPending] = useState<PendingTxState | null>(null);
  const [visible, setVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const polling = useTokenPolling(pending?.txHash ?? null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PendingTxState;
      if (typeof parsed.txHash !== "string" || parsed.txHash.length === 0) return;
      setPending(parsed);
      setVisible(true);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

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
      const isTokensList = pathname === "/tokens";
      const isSameTokenDetail = confirmedHash.length > 0 && pathname === `/tokens/${confirmedHash}`;
      if (isTokensList || isSameTokenDetail) {
        window.location.reload();
      }
      setPending(null);
      return;
    }
    if (polling.status === "faulted") {
      setErrorMessage(polling.error ?? "Transaction failed.");
      setPending(null);
    }
  }, [pathname, pending, polling.contractHash, polling.error, polling.status]);

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
    }),
    []
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
