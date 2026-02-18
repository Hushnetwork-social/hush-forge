/**
 * Environment-driven configuration for the Forge module.
 * All env vars are NEXT_PUBLIC_ — available both in server components and browser.
 * See .env.local.example for setup instructions.
 */

/** Neo N3 RPC endpoint (NeoExpress default: http://localhost:10332) */
export const NEO_RPC_URL =
  process.env.NEXT_PUBLIC_NEO_RPC_URL ?? "http://localhost:10332";

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

/** localStorage key for persisting wallet type across sessions. */
export const WALLET_STORAGE_KEY = "forge_wallet_type";
