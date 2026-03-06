import { addressToHash160 } from "./neo-rpc-client";
import type {
  ClaimableFactoryAsset,
  FactoryAdminAccess,
  GovernanceErrorCategory,
  GovernanceErrorInfo,
} from "./types";

const DATOSHI_FACTOR = 100_000_000n;

function parseUnsignedDecimal(value: string, maxDecimals: number): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > maxDecimals) return null;

  const paddedFraction = fraction.padEnd(maxDecimals, "0");
  try {
    return BigInt(whole) * (10n ** BigInt(maxDecimals)) + BigInt(paddedFraction || "0");
  } catch {
    return null;
  }
}

export function parseGasToDatoshi(value: string): bigint | null {
  return parseUnsignedDecimal(value, 8);
}

export function validateGovernanceFeeInput(
  value: string,
  currentDatoshi: bigint
): { valid: boolean; datoshi: bigint | null; reason: string | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, datoshi: null, reason: "Fee is required." };
  }

  if (trimmed.startsWith("-")) {
    return { valid: false, datoshi: null, reason: "Fee cannot be negative." };
  }

  const datoshi = parseGasToDatoshi(trimmed);
  if (datoshi === null) {
    return {
      valid: false,
      datoshi: null,
      reason: "Enter a valid GAS amount with up to 8 decimal places.",
    };
  }

  if (datoshi === currentDatoshi) {
    return { valid: false, datoshi, reason: "No change to submit." };
  }

  return { valid: true, datoshi, reason: null };
}

export function getFactoryAdminAccess(
  connectedAddress: string | null,
  ownerHash: string | null
): FactoryAdminAccess {
  const connectedHash = connectedAddress ? safeAddressToHash(connectedAddress) : null;
  const normalizedOwner = ownerHash?.toLowerCase() ?? null;
  const isOwner =
    connectedHash !== null &&
    normalizedOwner !== null &&
    connectedHash.toLowerCase() === normalizedOwner;

  return {
    connectedAddress,
    connectedHash,
    ownerHash: normalizedOwner,
    isOwner,
    navVisible: isOwner,
    routeAuthorized: isOwner,
  };
}

export function validatePartialClaimAmount(
  asset: ClaimableFactoryAsset,
  value: string
): { valid: boolean; amountRaw: bigint | null; reason: string | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, amountRaw: null, reason: "Amount is required." };
  }

  if (trimmed.startsWith("-")) {
    return { valid: false, amountRaw: null, reason: "Amount must be greater than 0." };
  }

  if (asset.decimals === null || !asset.partialClaimSupported) {
    return {
      valid: false,
      amountRaw: null,
      reason: "Partial claim is unavailable when asset decimals cannot be resolved.",
    };
  }

  const amountRaw = parseUnsignedDecimal(trimmed, asset.decimals);
  if (amountRaw === null) {
    return {
      valid: false,
      amountRaw: null,
      reason: `Enter a valid amount with up to ${asset.decimals} decimal places.`,
    };
  }

  if (amountRaw <= 0n) {
    return { valid: false, amountRaw, reason: "Amount must be greater than 0." };
  }

  if (amountRaw > asset.amount) {
    return { valid: false, amountRaw, reason: "Amount cannot exceed the current balance." };
  }

  return { valid: true, amountRaw, reason: null };
}

export function isGovernanceMutationLocked(
  activeMutationId: string | null,
  candidateMutationId: string
): boolean {
  return activeMutationId !== null && activeMutationId !== candidateMutationId;
}

export function normalizeGovernanceError(err: unknown): GovernanceErrorInfo {
  const details = extractErrorDetails(err);
  const lower = details.toLowerCase();
  const category = categorizeError(err, lower);

  return {
    category,
    message: friendlyMessageForCategory(category),
    technicalDetails: details || null,
  };
}

function safeAddressToHash(address: string): string | null {
  try {
    return addressToHash160(address);
  } catch {
    return null;
  }
}

function extractErrorDetails(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();

  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const candidates = [
      obj.description,
      obj.message,
      obj.error,
      obj.data,
      typeof obj.reason === "string" ? obj.reason : null,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      if (candidate && typeof candidate === "object") {
        const nested = candidate as Record<string, unknown>;
        if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
        if (typeof nested.description === "string" && nested.description.trim()) return nested.description.trim();
      }
    }
  }

  return typeof err === "string" ? err.trim() : "";
}

function categorizeError(err: unknown, details: string): GovernanceErrorCategory {
  const type =
    err && typeof err === "object" && "type" in err && typeof (err as { type?: unknown }).type === "string"
      ? (err as { type: string }).type.toUpperCase()
      : "";
  const name = err instanceof Error ? err.name : "";

  if (name === "WalletRejectedError" || type === "CANCELED" || type === "CANCELLED" || type === "REJECTED") {
    return "wallet_rejected";
  }
  if (name === "WalletNotConnectedError" || details.includes("wallet not installed") || details.includes("no wallet connected")) {
    return "wallet_unavailable";
  }
  if (details.includes("unauthorized") || details.includes("no authorization")) {
    return "authorization";
  }
  if (details.includes("insufficient") && (details.includes("gas") || details.includes("balance") || details.includes("fund"))) {
    return "insufficient_funds";
  }
  if (
    details.includes("invalid") ||
    details.includes("must be") ||
    details.includes("required") ||
    details.includes("exceed") ||
    details.includes("up to")
  ) {
    return "invalid_input";
  }
  if (name === "NeoRpcError" || type === "RPC_ERROR" || details.includes("neo rpc") || details.includes("network") || details.includes("timeout") || details.includes("unreachable")) {
    return "rpc_failure";
  }
  if (details.includes("fault") || details.includes("abort") || details.includes("on-chain")) {
    return "onchain_failure";
  }
  return "unknown";
}

function friendlyMessageForCategory(category: GovernanceErrorCategory): string {
  switch (category) {
    case "wallet_rejected":
      return "Signature request was cancelled in the wallet.";
    case "wallet_unavailable":
      return "Connect the owner wallet before performing this admin action.";
    case "authorization":
      return "Only the TokenFactory owner can perform this admin action.";
    case "insufficient_funds":
      return "The connected wallet does not have enough balance to complete this action.";
    case "invalid_input":
      return "One or more admin inputs are invalid. Review the highlighted values and try again.";
    case "rpc_failure":
      return "The network request failed. Retry the action or inspect the connection details.";
    case "onchain_failure":
      return "The transaction was submitted but failed on-chain. Inspect the technical details.";
    default:
      return "Unexpected admin error. Inspect the technical details and retry.";
  }
}

export const governanceMath = {
  DATOSHI_FACTOR,
};
