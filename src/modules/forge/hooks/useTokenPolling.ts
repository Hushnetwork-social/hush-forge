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

interface PollingOptions {
  timeoutMs?: number;
}

export function useTokenPolling(
  txHash: string | null,
  options?: PollingOptions
): TokenPollingResult {
  const [state, setState] = useState<TokenPollingResult>({
    status: "pending",
    contractHash: null,
    error: null,
  });

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setState({
        status: "pending",
        contractHash: null,
        error: null,
      });
    });

    pollForConfirmation(
      txHash,
      (status) => {
        if (cancelled) return;
        setState((current) => ({ ...current, status }));
      },
      { timeoutMs: options?.timeoutMs ?? 0 }
    )
      .then((event) => {
        if (cancelled) return;
        setState({
          status: "confirmed",
          contractHash: event.contractHash ?? null,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof TxTimeoutError) {
          setState({
            status: "timeout",
            contractHash: null,
            error: "Transaction is still pending confirmation.",
          });
        } else if (err instanceof TxFaultedError) {
          setState({
            status: "faulted",
            contractHash: null,
            error: `Transaction faulted: ${err.txHash}`,
          });
        } else {
          setState({
            status: "faulted",
            contractHash: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [txHash, options?.timeoutMs]);

  return state;
}
