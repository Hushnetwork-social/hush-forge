/**
 * useTokenPolling — Manages TX confirmation polling state for the WaitingOverlay.
 *
 * Starts polling when txHash becomes non-null.
 * Uses a cancelled flag to prevent state updates after unmount.
 * On success: status → "confirmed", contractHash set.
 * On fault: status → "faulted", error message set.
 * On timeout: status → "timeout", error message set.
 */

import { useEffect, useState } from "react";
import {
  pollForConfirmation,
  TxFaultedError,
  TxTimeoutError,
} from "../forge-service";
import type { TxStatus } from "../types";

export interface TokenPollingResult {
  status: TxStatus;
  contractHash: string | null;
  error: string | null;
}

export function useTokenPolling(txHash: string | null): TokenPollingResult {
  const [status, setStatus] = useState<TxStatus>("confirming");
  const [contractHash, setContractHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    pollForConfirmation(txHash, (s) => {
      if (!cancelled) setStatus(s);
    })
      .then((event) => {
        if (cancelled) return;
        setStatus("confirmed");
        setContractHash(event.contractHash);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof TxTimeoutError) {
          setStatus("timeout");
          setError("Transaction not confirmed after 5 minutes.");
        } else if (err instanceof TxFaultedError) {
          setStatus("faulted");
          setError(`Transaction faulted: ${err.txHash}`);
        } else {
          setStatus("faulted");
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [txHash]);

  return { status, contractHash, error };
}
