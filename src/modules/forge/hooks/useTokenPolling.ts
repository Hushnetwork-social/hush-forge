/**
 * useTokenPolling — Manages TX confirmation polling state for the WaitingOverlay.
 *
 * Starts polling when txHash becomes non-null.
 * Uses a cancelled flag to prevent state updates after unmount.
 * On success: status → "confirmed", contractHash set.
 * On fault: status → "faulted", error message set.
 * On timeout: status → "timeout", error message set.
 */

import { useEffect, useMemo, useState } from "react";
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

interface TokenPollingState extends TokenPollingResult {
  txHash: string | null;
}

interface PollingOptions {
  timeoutMs?: number;
}

export function useTokenPolling(
  txHash: string | null,
  options?: PollingOptions
): TokenPollingResult {
  const [state, setState] = useState<TokenPollingState>({
    txHash: null,
    status: "pending",
    contractHash: null,
    error: null,
  });

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    pollForConfirmation(
      txHash,
      (status) => {
        if (cancelled) return;
        setState((current) => ({
          txHash,
          status,
          contractHash: current.txHash === txHash ? current.contractHash : null,
          error: null,
        }));
      },
      { timeoutMs: options?.timeoutMs ?? 0 }
    )
      .then((event) => {
        if (cancelled) return;
        setState({
          txHash,
          status: "confirmed",
          contractHash: event.contractHash ?? null,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof TxTimeoutError) {
          setState({
            txHash,
            status: "timeout",
            contractHash: null,
            error: "Transaction is still pending confirmation.",
          });
        } else if (err instanceof TxFaultedError) {
          setState({
            txHash,
            status: "faulted",
            contractHash: null,
            error: `Transaction faulted: ${err.txHash}`,
          });
        } else {
          setState({
            txHash,
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

  return useMemo(() => {
    if (!txHash || state.txHash !== txHash) {
      return {
        status: "pending" as const,
        contractHash: null,
        error: null,
      };
    }

    return {
      status: state.status,
      contractHash: state.contractHash,
      error: state.error,
    };
  }, [state.contractHash, state.error, state.status, state.txHash, txHash]);
}
