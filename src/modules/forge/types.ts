/**
 * Shared TypeScript types for the Forge token module.
 * All Neo N3 entities are strongly typed — no `any`.
 */

// ---------------------------------------------------------------------------
// Token data
// ---------------------------------------------------------------------------

/** Token data from factory GetToken() registry. */
export interface TokenInfo {
  contractHash: string; // 0x-prefixed, 42 chars
  symbol: string;
  name: string;
  creator: string | null; // null for non-factory tokens
  supply: bigint; // raw integer (never number — precision loss risk)
  decimals: number;
  mode: "community" | "speculative" | "crowdfund" | "premium" | null; // null for non-factory tokens
  tier: number | null; // null for non-factory tokens
  createdAt: number | null; // null for non-factory tokens
  isNative?: boolean; // true for NEO / GAS native contracts
  imageUrl?: string; // optional user-supplied icon URL (stored as metadataUri on TokenTemplate)
  burnRate?: number; // basis points 0–1000; 0 = no burn
  maxSupply?: string; // BigInt as string; "0" = uncapped
  locked?: boolean; // true if token is permanently locked
}

/** NEP-17 token metadata fetched directly from the token contract. */
export interface TokenMetadata {
  contractHash: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: bigint;
}

// ---------------------------------------------------------------------------
// Wallet state
// ---------------------------------------------------------------------------

export type WalletType = "NeoLine" | "OneGate" | "Neon" | "disconnected";

/** Single NEP-17 balance entry for a connected wallet. */
export interface WalletBalance {
  contractHash: string;
  symbol: string;
  amount: bigint; // raw integer balance (no decimal shift applied)
  decimals: number;
  displayAmount: string; // human-readable with decimal point (e.g. "15.00000000")
}

/** Full connected wallet state. */
export interface WalletState {
  type: WalletType;
  address: string;
  balances: WalletBalance[];
}

// ---------------------------------------------------------------------------
// Transaction lifecycle
// ---------------------------------------------------------------------------

export type TxStatus =
  | "pending" // submitted, not yet seen in mempool
  | "confirming" // seen in mempool, not yet in a block
  | "confirmed" // included in a block, ApplicationLog available
  | "faulted" // ApplicationLog state = FAULT
  | "timeout"; // polling timed out without confirmation

// ---------------------------------------------------------------------------
// Forge form data
// ---------------------------------------------------------------------------

/** User-entered parameters for creating a new token. */
export interface ForgeParams {
  name: string;
  symbol: string;
  supply: bigint; // stored as bigint — never number
  decimals: number;
  mode: "community";
  imageUrl?: string; // optional icon URL — stored as metadataUri on the deployed TokenTemplate
}

/** User-entered parameters for updating an existing token. */
export interface UpdateParams {
  name: string;
  symbol: string;
}

// ---------------------------------------------------------------------------
// Contract events
// ---------------------------------------------------------------------------

/** Parsed TokenCreated event from ApplicationLog notifications. */
export interface TokenCreatedEvent {
  contractHash: string;
  creator: string;
  symbol: string;
  supply: bigint;
  mode: "community" | "premium";
  tier: number;
}

// ---------------------------------------------------------------------------
// Neo RPC response structures
// ---------------------------------------------------------------------------

export interface RpcStackItem {
  type: string;
  value: unknown;
}

export interface RpcExecution {
  trigger: string;
  vmstate: "HALT" | "FAULT";
  gasconsumed: string;
  stack: RpcStackItem[];
  notifications: RpcNotification[];
  exception?: string;
}

export interface RpcNotification {
  contract: string;
  eventname: string;
  state: {
    type: string;
    value: RpcStackItem[];
  };
}

/** Raw RPC response for invokefunction. */
export interface InvokeResult {
  script: string;
  state: "HALT" | "FAULT";
  gasconsumed: string;
  stack: RpcStackItem[];
  exception?: string;
}

/** Raw RPC response for getapplicationlog. */
export interface ApplicationLog {
  txid: string;
  executions: RpcExecution[];
}

/** Typed error thrown by the Neo RPC client. */
export class NeoRpcError extends Error {
  constructor(
    message: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = "NeoRpcError";
  }
}
