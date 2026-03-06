/**
 * useFactoryDeployment â€” detects whether the TokenFactory is deployed and
 * initialized on the current network, and provides deploy/initialize actions.
 *
 * Status lifecycle:
 *   "idle" â†’ "checking" â†’ "deployed" | "not-deployed" | "not-initialized"
 *   "not-deployed"    â†’ [deploy()]      â†’ "deploying" â†’ "initializing" â†’ "deployed" | "deploy-error"
 *   "not-initialized" â†’ [initialize()]  â†’ "initializing" â†’ "deployed" | "deploy-error"
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
import {
  getApplicationLog,
  getRawMemPool,
  invokeFunction,
  isContractDeployed,
  addressToHash160,
} from "../neo-rpc-client";
import { computeContractHash } from "../utils/neo-hash";
import type { ApplicationLog } from "../types";

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

type PendingFactoryTx = {
  kind: "deploy" | "initialize";
  txid: string;
  factoryHash?: string;
};

const FACTORY_PENDING_TX_KEY = "forge.factory.pendingTx";

export function useFactoryDeployment(
  /** Connected wallet address â€” starts checking once this is set */
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

    (async () => {
      const pending = loadPendingFactoryTx();
      if (pending) {
        setStatus(pending.kind === "deploy" ? "deploying" : "initializing");
        try {
          await pollDeploymentConfirmed(pending.txid, {
            timeoutMs: 0,
            onProgress: (s) => {
              if (cancelled) return;
              setStatus(s === "confirming"
                ? pending.kind === "deploy" ? "deploying" : "initializing"
                : pending.kind === "deploy" ? "deploying" : "initializing");
            },
          });
          clearPendingFactoryTx();
          if (cancelled) return;
          setRecheckToken((token) => token + 1);
        } catch (err) {
          clearPendingFactoryTx();
          if (cancelled) return;
          setDeployError(formatDeployError(err));
          setStatus("deploy-error");
        }
        return;
      }

      const hash = getRuntimeFactoryHash();
      if (!hash) {
        // No hash configured and nothing in localStorage â€” factory has never been deployed.
        setStatus("not-deployed");
        return;
      }

      setStatus("checking");
      const deployed = await isContractDeployed(hash);
      if (cancelled) return;

      if (!deployed) {
        setStatus("not-deployed");
        return;
      }

      // Contract exists â€” check if initialized (NEF stored in factory)
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
      let deployedHash: string | null = null;

      // ---- Step 1: Deploy ----
      try {
        const txid = await dapiDeployFactory();
        console.log("[factory] deploy tx submitted:", txid);
        savePendingFactoryTx({ kind: "deploy", txid });
        await pollDeploymentConfirmed(txid, { timeoutMs: 0 });
        clearPendingFactoryTx();

        console.log("[factory] deploy tx confirmed â€” reading app log for hash...");
        // Primary: read the actual contract hash from ContractManagement's Deploy notification.
        // This is the only reliable source â€” pre-computing is fragile (byte-order of sender hash).
        const log = await getApplicationLog(txid);
        if (log) {
          const extracted = extractDeployedHashFromLog(log);
          if (extracted) {
            // Verify the hash is actually visible on-chain (handles byte-order & timing).
            // Try both the extracted hash and its byte-reversed form.
            const isDeployed = await isContractDeployed(extracted);
            if (isDeployed) {
              deployedHash = extracted;
            } else {
              const reversed = reverseHashBytes(extracted);
              const isReversedDeployed = await isContractDeployed(reversed);
              if (isReversedDeployed) {
                console.log("[factory] using byte-reversed hash:", reversed);
                deployedHash = reversed;
              }
            }
          }
        }

        if (!deployedHash) {
          // Fallback: compute deterministically (may be wrong if sender bytes are mis-ordered)
          const nefRes = await fetch("/contracts/TokenFactory.nef");
          const nefBytes = new Uint8Array(await nefRes.arrayBuffer());
          deployedHash = await computeContractHash(
            addressToHash160(address),
            nefBytes,
            "TokenFactory"
          );
          console.warn("[factory] could not read hash from log, using computed:", deployedHash);
        }

        // Wait for the contract to be visible to NeoLine's RPC (timing safety).
        // NeoLine does an invokefunction dry-run before submitting â€” the state must be ready.
        await waitUntilContractDeployed(deployedHash, 10_000);

        console.log("[factory] deployed at:", deployedHash);
      } catch (deployErr) {
        if (isContractAlreadyExistsError(deployErr)) {
          // Contract already at this address+NEF combination (e.g. after app restart on an
          // existing chain). The error message from NeoLine contains the actual hash.
          deployedHash = extractHashFromAlreadyExistsError(deployErr);
          console.log(
            "[factory] contract already exists at:",
            deployedHash ?? "(unknown hash)",
            "â€” recovering"
          );

          if (deployedHash) {
            saveFactoryHash(deployedHash);
            setFactoryHash(deployedHash);

            // Check if already initialized â€” return early if so
            try {
              const result = await invokeFunction(deployedHash, "isInitialized", []);
              const initialized =
                result.stack[0]?.value === true || result.stack[0]?.value === "1";
              if (initialized) {
                setStatus("deployed");
                return;
              }
            } catch { /* not initialized â€” fall through to initialize */ }
          } else {
            throw new Error(
              "Contract already deployed but its hash could not be determined. " +
              "Check the browser console for the actual hash and set it manually."
            );
          }
        } else {
          throw deployErr;
        }
      }

      if (!deployedHash) throw new Error("Could not determine deployed contract hash");

      saveFactoryHash(deployedHash);
      setFactoryHash(deployedHash);

      // ---- Step 2: Initialize ----
      setStatus("initializing");
      try {
        const initTxid = await dapiInitializeFactory(deployedHash);
        console.log("[factory] setNefAndManifest tx submitted:", initTxid);
        savePendingFactoryTx({ kind: "initialize", txid: initTxid, factoryHash: deployedHash });
        await pollDeploymentConfirmed(initTxid, { timeoutMs: 0 });
        clearPendingFactoryTx();
        console.log("[factory] initialized â€” ready to forge tokens");
        setStatus("deployed");
      } catch (initErr) {
        clearPendingFactoryTx();
        // Factory is deployed but initialization failed (e.g. NeoLine state lag, user cancel).
        // Show "Initialize Factory" button so the user can retry without redeploying.
        console.error("[factory] init failed:", initErr);
        setDeployError(formatDeployError(initErr));
        setStatus("not-initialized");
      }
    } catch (err) {
      clearPendingFactoryTx();
      console.error("[factory] deploy failed:", err);
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
      savePendingFactoryTx({ kind: "initialize", txid: initTxid, factoryHash: hash });
      await pollDeploymentConfirmed(initTxid, { timeoutMs: 0 });
      clearPendingFactoryTx();
      console.log("[factory] initialized â€” ready to forge tokens");

      setStatus("deployed");
    } catch (err) {
      clearPendingFactoryTx();
      console.error("[factory] initialize failed:", err);
      setDeployError(formatDeployError(err));
      setStatus("deploy-error");
    }
  }, []);

  return { status, factoryHash, deployError, deploy, initialize, recheck };
}

// ---------------------------------------------------------------------------
// Hash / timing helpers
// ---------------------------------------------------------------------------

/** Returns the hash with all 20 bytes in reversed order (LE â†” BE swap). */
function reverseHashBytes(hash: string): string {
  const hex = hash.startsWith("0x") ? hash.slice(2) : hash;
  return "0x" + hex.match(/.{2}/g)!.reverse().join("");
}

/**
 * Polls isContractDeployed until the contract is visible on-chain.
 * NeoLine does an `invokefunction` dry-run before submitting the init TX;
 * the contract state must be fully committed before that call is made.
 * Throws if the contract is still not visible after timeoutMs.
 */
async function waitUntilContractDeployed(hash: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployed = await isContractDeployed(hash);
    if (deployed) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `Timed out waiting for contract ${hash} to appear on-chain after ${timeoutMs / 1000}s`
  );
}

// ---------------------------------------------------------------------------
// ApplicationLog helpers
// ---------------------------------------------------------------------------

/** ContractManagement hash â€” same on every Neo N3 network. */
const CONTRACT_MGMT_HASH = "0xfffdc93764dbaddd97c48f252a53ea4643faa3fd";

/**
 * Scans an ApplicationLog for ContractManagement's "Deploy" notification and
 * extracts the actual deployed contract hash (LE hex, 0x-prefixed).
 *
 * ContractManagement emits: Deploy(ByteString contractHash)
 * The ByteString is the 20 LE bytes of the UInt160 contract hash.
 */
function extractDeployedHashFromLog(log: ApplicationLog): string | null {
  for (const exec of log.executions) {
    console.log("[factory] applog exec â€” trigger:", exec.trigger, "vmstate:", exec.vmstate,
      "notifications:", exec.notifications?.length ?? 0);
    if (exec.trigger !== "Application") continue;
    for (const notif of exec.notifications ?? []) {
      console.log("[factory] notification â€” contract:", notif.contract,
        "event:", notif.eventname, "state[0]:", JSON.stringify(notif.state.value[0]));
      if (
        notif.contract.toLowerCase() === CONTRACT_MGMT_HASH &&
        notif.eventname === "Deploy"
      ) {
        const item = notif.state.value[0];
        if (item?.type === "ByteString" && typeof item.value === "string") {
          try {
            const bytes = Uint8Array.from(atob(item.value), (c) => c.charCodeAt(0));
            console.log("[factory] Deploy notification bytes length:", bytes.length,
              "raw hex:", Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
            if (bytes.length === 20) {
              return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
            }
          } catch { /* invalid base64 or wrong length â€” skip */ }
        } else {
          console.log("[factory] Deploy notification item type:", item?.type, "value:", item?.value);
        }
      }
    }
  }
  return null;
}

/**
 * Extracts the "0x..."-prefixed contract hash from a "Contract Already Exists: 0x..."
 * error message emitted by NeoLine / the RPC node.
 */
function extractHashFromAlreadyExistsError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const obj = err as Record<string, unknown>;
  const desc =
    typeof obj.description === "string"
      ? obj.description
      : typeof (obj.description as Record<string, unknown> | null)?.message === "string"
      ? ((obj.description as Record<string, unknown>).message as string)
      : "";
  const match = /0x[0-9a-fA-F]{40}/i.exec(desc);
  return match ? match[0].toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function isContractAlreadyExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const obj = err as Record<string, unknown>;
  const desc =
    typeof obj.description === "string"
      ? obj.description
      : typeof (obj.description as Record<string, unknown> | null)?.message === "string"
      ? ((obj.description as Record<string, unknown>).message as string)
      : "";
  return desc.toLowerCase().includes("contract already exists");
}

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

function pollDeploymentConfirmed(
  txid: string,
  options?: { timeoutMs?: number; onProgress?: (status: "pending" | "confirming") => void }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? TX_POLLING_TIMEOUT_MS;
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY;

  return new Promise((resolve, reject) => {
    async function check() {
      try {
        const log = await getApplicationLog(txid);
        if (log === null) {
          const mempool = await getRawMemPool();
          const inMempool = mempool.some(
            (hash) => hash.toLowerCase() === txid.toLowerCase()
          );
          options?.onProgress?.(inMempool ? "confirming" : "pending");
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

function loadPendingFactoryTx(): PendingFactoryTx | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(FACTORY_PENDING_TX_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingFactoryTx;
    if (
      (parsed.kind === "deploy" || parsed.kind === "initialize") &&
      typeof parsed.txid === "string" &&
      parsed.txid.length > 0
    ) {
      return parsed;
    }
  } catch {
    // ignore malformed persisted values
  }
  return null;
}

function savePendingFactoryTx(value: PendingFactoryTx): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FACTORY_PENDING_TX_KEY, JSON.stringify(value));
}

function clearPendingFactoryTx(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FACTORY_PENDING_TX_KEY);
}

