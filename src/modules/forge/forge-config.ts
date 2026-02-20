/**
 * Environment-driven configuration for the Forge module.
 * All env vars are NEXT_PUBLIC_ — available both in server components and browser.
 * See .env.local.example for setup instructions.
 *
 * RPC URL priority:
 *   1. Wallet's selected network (N3MainNet / N3TestNet) → known public RPC endpoints
 *   2. NEXT_PUBLIC_NEO_RPC_URL env var → used ONLY for private / custom networks
 *      where the dAPI does not expose the node URL.
 */

/**
 * TokenFactory contract hash (0x-prefixed, 42 chars).
 * MUST be set in .env.local — empty string will cause runtime errors on contract calls.
 */
export const FACTORY_CONTRACT_HASH =
  process.env.NEXT_PUBLIC_FACTORY_CONTRACT_HASH ?? "";

/** How long to poll for TX confirmation before giving up (ms). Default: 5 minutes. */
export const TX_POLLING_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_TX_POLLING_TIMEOUT_MS ?? "300000"
);

/** How often to check TX confirmation status (ms). Default: 5 seconds. */
export const TX_POLLING_INTERVAL_MS = Number(
  process.env.NEXT_PUBLIC_TX_POLLING_INTERVAL_MS ?? "5000"
);

/** NeoTube explorer base URL (used for transaction + contract links). */
export const NEOTUBE_BASE_URL =
  process.env.NEXT_PUBLIC_NEOTUBE_BASE_URL ?? "https://testnet.neotube.io";

/** GAS contract hash on Neo N3 (same on all networks). */
export const GAS_CONTRACT_HASH =
  "0xd2a4cff31913016155e38e474a2c06d08be276cf";

/**
 * Optional RPC URL override for private / custom Neo N3 networks.
 * This is ONLY used when the connected wallet's network is not one of the
 * well-known public networks (N3MainNet / N3TestNet). Public networks always
 * use the canonical RPC endpoints — this value is ignored for them.
 *
 * Set in .env.local: NEXT_PUBLIC_NEO_RPC_URL=http://127.0.0.1:10332
 */
export const PRIVATE_NET_RPC_URL =
  process.env.NEXT_PUBLIC_NEO_RPC_URL ?? "";

/** localStorage key for persisting wallet type across sessions. */
export const WALLET_STORAGE_KEY = "forge_wallet_type";

/** localStorage key for persisting the last connected address across sessions. */
export const WALLET_ADDRESS_STORAGE_KEY = "forge_wallet_address";

/** localStorage key for the deployed factory contract hash (set after in-browser deployment). */
export const FACTORY_HASH_STORAGE_KEY = "forge_factory_hash";

/**
 * Returns the factory contract hash at runtime.
 * Priority: NEXT_PUBLIC_ env var → localStorage (set after in-browser deploy) → ""
 */
export function getRuntimeFactoryHash(): string {
  const envHash = process.env.NEXT_PUBLIC_FACTORY_CONTRACT_HASH ?? "";
  if (envHash && envHash !== "0x") return envHash;
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(FACTORY_HASH_STORAGE_KEY);
    if (saved && saved !== "0x") return saved;
  }
  return "";
}

/** Persists the factory hash to localStorage after an in-browser deployment. */
export function saveFactoryHash(hash: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(FACTORY_HASH_STORAGE_KEY, hash);
  }
}
