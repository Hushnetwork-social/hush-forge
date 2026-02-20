/**
 * useFactoryDeployment — detects whether the TokenFactory is deployed and
 * initialized on the current network, and provides deploy/initialize actions.
 *
 * Status lifecycle:
 *   "idle" → "checking" → "deployed" | "not-deployed" | "not-initialized"
 *   "not-deployed"    → [deploy()]      → "deploying" → "initializing" → "deployed" | "deploy-error"
 *   "not-initialized" → [initialize()]  → "initializing" → "deployed" | "deploy-error"
 */

import { useCallback, useEffect, useState } from "react";
import {
  deployFactory as dapiDeployFactory,
  initializeFactory as dapiInitializeFactory,
} from "../neo-dapi-adapter";
import {
  getRuntimeFactoryHash,
  saveFactoryHash,
  TX_POLLING_INTERVAL_MS,
  TX_POLLING_TIMEOUT_MS,
} from "../forge-config";
import { getApplicationLog, invokeFunction, isContractDeployed } from "../neo-rpc-client";
import { computeContractHash } from "../utils/neo-hash";

export type FactoryDeployStatus =
  | "idle"
  | "checking"
  | "deployed"
  | "not-deployed"
  | "not-initialized"
  | "deploying"
  | "initializing"
  | "deploy-error";

interface UseFactoryDeployment {
  status: FactoryDeployStatus;
  factoryHash: string;
  deployError: string | null;
  deploy: () => Promise<void>;
  initialize: () => Promise<void>;
  /** Call after checking to refresh (e.g. after external deployment) */
  recheck: () => void;
}

export function useFactoryDeployment(
  /** Connected wallet address — starts checking once this is set */
  address: string | null
): UseFactoryDeployment {
  const [status, setStatus] = useState<FactoryDeployStatus>("idle");
  const [factoryHash, setFactoryHash] = useState(() => getRuntimeFactoryHash());
  const [deployError, setDeployError] = useState<string | null>(null);
  const [recheckToken, setRecheckToken] = useState(0);

  // Check deployment + initialization when wallet connects or recheckToken changes
  useEffect(() => {
    if (!address) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("checking");

    const hash = getRuntimeFactoryHash();

    (async () => {
      const deployed = await isContractDeployed(hash);
      if (cancelled) return;

      if (!deployed) {
        setStatus("not-deployed");
        return;
      }

      // Contract exists — check if initialized (NEF stored in factory)
      try {
        const result = await invokeFunction(hash, "isInitialized", []);
        const initialized = result.stack[0]?.value === true || result.stack[0]?.value === "1";
        if (cancelled) return;
        setStatus(initialized ? "deployed" : "not-initialized");
      } catch {
        if (cancelled) return;
        // If we can't check, assume deployed (it responded to getcontractstate)
        setStatus("deployed");
      }
    })();

    return () => { cancelled = true; };
  }, [address, recheckToken]);

  const recheck = useCallback(() => setRecheckToken((t) => t + 1), []);

  const deploy = useCallback(async () => {
    if (!address) return;
    setStatus("deploying");
    setDeployError(null);

    try {
      // Compute the hash we expect BEFORE submitting (deterministic)
      const [nefRes] = await Promise.all([fetch("/contracts/TokenFactory.nef")]);
      const nefBytes = new Uint8Array(await nefRes.arrayBuffer());
      const expectedHash = await computeContractHash(address, nefBytes, "TokenFactory");

      // Step 1: Submit deployment transaction via NeoLine
      const txid = await dapiDeployFactory();
      console.log("[factory] deploy tx submitted:", txid, "expected hash:", expectedHash);

      // Poll for deployment confirmation
      await pollDeploymentConfirmed(txid);
      console.log("[factory] deployed at:", expectedHash);

      // Step 2: Initialize factory with TokenTemplate NEF+manifest
      setStatus("initializing");
      const initTxid = await dapiInitializeFactory(expectedHash);
      console.log("[factory] setNefAndManifest tx submitted:", initTxid);

      await pollDeploymentConfirmed(initTxid);
      console.log("[factory] initialized — ready to forge tokens");

      // Save and expose the hash
      saveFactoryHash(expectedHash);
      setFactoryHash(expectedHash);
      setStatus("deployed");
    } catch (err) {
      console.error("[factory] deploy/init failed:", err);
      setDeployError(formatDeployError(err));
      setStatus("deploy-error");
    }
  }, [address]);

  const initialize = useCallback(async () => {
    const hash = getRuntimeFactoryHash();
    if (!hash) return;
    setStatus("initializing");
    setDeployError(null);

    try {
      const initTxid = await dapiInitializeFactory(hash);
      console.log("[factory] setNefAndManifest tx submitted:", initTxid);

      await pollDeploymentConfirmed(initTxid);
      console.log("[factory] initialized — ready to forge tokens");

      setStatus("deployed");
    } catch (err) {
      console.error("[factory] initialize failed:", err);
      setDeployError(formatDeployError(err));
      setStatus("deploy-error");
    }
  }, []);

  return { status, factoryHash, deployError, deploy, initialize, recheck };
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function formatDeployError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    // NeoLine error format: { type: "RPC_ERROR", description: "..." }
    if (typeof obj.description === "string" && obj.description) return obj.description;
    const desc = obj.description as Record<string, unknown> | null | undefined;
    if (typeof desc?.message === "string" && desc.message) return desc.message;
    if (typeof desc?.error === "string" && desc.error) return desc.error;
    if (typeof obj.type === "string") return `Wallet error (${obj.type})`;
    return JSON.stringify(err);
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Internal polling helper
// ---------------------------------------------------------------------------

function pollDeploymentConfirmed(txid: string): Promise<void> {
  const deadline = Date.now() + TX_POLLING_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    async function check() {
      try {
        const log = await getApplicationLog(txid);
        if (log === null) {
          if (Date.now() >= deadline) { reject(new Error("Deployment timed out")); return; }
          setTimeout(check, TX_POLLING_INTERVAL_MS);
          return;
        }
        const exec = log.executions.find((e) => e.trigger === "Application");
        if (exec?.vmstate === "FAULT") {
          reject(new Error(`Deployment faulted: ${exec.exception ?? "unknown reason"}`));
          return;
        }
        resolve();
      } catch {
        if (Date.now() >= deadline) { reject(new Error("Deployment timed out")); return; }
        setTimeout(check, TX_POLLING_INTERVAL_MS);
      }
    }
    check();
  });
}
