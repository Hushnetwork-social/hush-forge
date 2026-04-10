/**
 * Shared TypeScript types for the Forge token module.
 * All Neo N3 entities are strongly typed - no `any`.
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
  supply: bigint; // raw integer (never number - precision loss risk)
  decimals: number;
  mode: "community" | "speculative" | "crowdfund" | "premium" | null; // null for non-factory tokens
  tier: number | null; // null for non-factory tokens
  createdAt: number | null; // null for non-factory tokens
  isNative?: boolean; // true for NEO / GAS native contracts
  imageUrl?: string; // optional user-supplied icon URL (stored as metadataUri on TokenTemplate)
  burnRate?: number; // basis points 0-1000; 0 = no burn
  maxSupply?: string; // BigInt as string; "0" = uncapped
  locked?: boolean; // true if token is permanently locked
  mintable?: boolean; // false for fixed supply tokens (hides supply admin tab)
  creatorFeeRate?: number; // per-transfer GAS fee in datoshi
  platformFeeRate?: number; // per-transfer GAS fee in datoshi
  claimableCreatorFee?: bigint; // creator-fee GAS currently accrued in the token contract
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
// Market data
// ---------------------------------------------------------------------------

export type MarketQuoteAsset = "GAS" | "NEO";
export type MarketPairStatus = "active" | "graduation_ready" | "unknown";
export type MarketDataSourceMode = "baseline" | "indexer";
export type LaunchProfileId = "starter" | "standard" | "growth" | "flagship";

export interface MarketCurveState {
  tokenHash: string;
  contractStatus: string;
  status: MarketPairStatus;
  quoteAsset: MarketQuoteAsset;
  launchProfile?: LaunchProfileId | null;
  virtualQuote: bigint;
  virtualTokens: bigint;
  realQuote: bigint;
  currentCurveInventory: bigint;
  invariantK: bigint;
  graduationThreshold: bigint;
  graduationReady: boolean;
  currentPrice: bigint;
  totalTrades: bigint;
  createdAt: number | null;
  curveInventory: bigint;
  retainedInventory: bigint;
  totalSupply: bigint;
}

export interface MarketBuyQuote {
  tokenHash: string;
  grossQuoteIn: bigint;
  quoteConsumed: bigint;
  quoteRefund: bigint;
  grossTokenOut: bigint;
  burnAmount: bigint;
  netTokenOut: bigint;
  platformFee: bigint;
  creatorFee: bigint;
  nextPrice: bigint;
  capped: boolean;
}

export interface MarketSellQuote {
  tokenHash: string;
  grossTokenIn: bigint;
  burnAmount: bigint;
  netTokenIn: bigint;
  grossQuoteOut: bigint;
  netQuoteOut: bigint;
  platformFee: bigint;
  creatorFee: bigint;
  nextPrice: bigint;
  liquidityOkay: boolean;
}

export interface MarketGraduationProgress {
  tokenHash: string;
  realQuote: bigint;
  graduationThreshold: bigint;
  progressBps: number;
  graduationReady: boolean;
}

export interface MarketEnhancementCapabilities {
  mode: MarketDataSourceMode;
  marketList: boolean;
  trendData: boolean;
  candles: boolean;
  tradeHistory: boolean;
  holders: boolean;
  topTraders: boolean;
  liveFeed: boolean;
  contractChangeFeed: boolean;
}

export interface MarketDiscoveryItem {
  pairHash: string;
  tokenHash: string;
  pairLabel: string;
  token: TokenInfo;
  quoteAsset: MarketQuoteAsset;
  marketType: "BondingCurve";
  status: MarketPairStatus;
  contractStatus: string;
  lastPrice: bigint | null;
  volume24h: bigint | null;
  tradeCount24h: number | null;
  totalTrades: bigint | null;
  createdAt: number | null;
  launchCurveInventory: bigint | null;
  launchRetainedInventory: bigint | null;
  totalSupply: bigint | null;
  searchableText: string;
  curve: MarketCurveState | null;
}

export interface MarketPairReadModel {
  pairHash: string;
  tokenHash: string;
  pairLabel: string;
  token: TokenInfo;
  quoteAsset: MarketQuoteAsset;
  marketType: "BondingCurve";
  curve: MarketCurveState;
  graduation: MarketGraduationProgress;
  capabilities: MarketEnhancementCapabilities;
}

export type MarketCandleInterval = "1m" | "5m" | "15m" | "1h" | "1d";

export interface MarketCandle {
  time: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
}

export interface MarketTradeHistoryEntry {
  id: string;
  occurredAt: number;
  side: "buy" | "sell";
  trader: string;
  quoteAsset: MarketQuoteAsset;
  quoteAmount: bigint;
  tokenAmount: bigint;
  price: bigint;
  txHash: string;
}

export interface MarketHolderEntry {
  rank: number;
  address: string;
  balance: bigint;
  shareBps: number | null;
}

export interface MarketTopTraderEntry {
  rank: number;
  address: string;
  totalTrades: number;
  buyVolume: bigint;
  sellVolume: bigint;
  netQuoteVolume: bigint;
}

export interface MarketActivitySnapshot {
  tokenHash: string;
  interval: "15m";
  indexedThroughBlock: number;
  indexedAt: number;
  candles: MarketCandle[];
  trades: MarketTradeHistoryEntry[];
  holders: MarketHolderEntry[];
  topTraders: MarketTopTraderEntry[];
}

export interface MarketLiveTradeEvent extends MarketTradeHistoryEntry {
  currentPrice: bigint | null;
}

export interface MarketCandleQuery {
  tokenHash: string;
  interval: MarketCandleInterval;
  limit?: number;
}

export interface MarketTradeHistoryQuery {
  tokenHash: string;
  limit?: number;
  cursor?: string | null;
}

export interface MarketHolderQuery {
  tokenHash: string;
  limit?: number;
}

export interface MarketTopTraderQuery {
  tokenHash: string;
  limit?: number;
}

export interface MarketDiscoveryProvider {
  isAvailable(): boolean;
  listPairs(searchQuery?: string): Promise<MarketDiscoveryItem[]>;
}

export interface MarketTrendingProvider {
  isAvailable(): boolean;
  listTrendingPairs(limit: number): Promise<MarketDiscoveryItem[]>;
}

export interface MarketCandleProvider {
  isAvailable(): boolean;
  getCandles(query: MarketCandleQuery): Promise<MarketCandle[]>;
}

export interface MarketTradeHistoryProvider {
  isAvailable(): boolean;
  getTrades(query: MarketTradeHistoryQuery): Promise<MarketTradeHistoryEntry[]>;
}

export interface MarketHolderProvider {
  isAvailable(): boolean;
  getHolders(query: MarketHolderQuery): Promise<MarketHolderEntry[]>;
}

export interface MarketTopTraderProvider {
  isAvailable(): boolean;
  getTopTraders(query: MarketTopTraderQuery): Promise<MarketTopTraderEntry[]>;
}

export interface MarketLiveFeedProvider {
  isAvailable(): boolean;
  subscribe(
    tokenHash: string,
    onTrade: (event: MarketLiveTradeEvent) => void
  ): () => void;
}

export interface MarketEnhancementServices {
  discovery: MarketDiscoveryProvider;
  trending: MarketTrendingProvider;
  candles: MarketCandleProvider;
  tradeHistory: MarketTradeHistoryProvider;
  holders: MarketHolderProvider;
  topTraders: MarketTopTraderProvider;
  liveFeed: MarketLiveFeedProvider;
}

export interface MarketLaunchSummary {
  tokenHash: string;
  pairLabel: string;
  quoteAsset: MarketQuoteAsset;
  launchProfile?: LaunchProfileId | null;
  tokenSymbol: string;
  curveInventoryRaw: string;
  retainedInventoryRaw: string;
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
// Factory governance data
// ---------------------------------------------------------------------------

export interface FactoryConfig {
  creationFee: bigint;
  operationFee: bigint;
  paused: boolean;
  owner: string;
  templateScriptHash: string;
  templateVersion: bigint;
  templateNefStored: boolean;
  templateManifestStored: boolean;
}

export interface ClaimableFactoryAsset {
  contractHash: string;
  symbol: string;
  name: string;
  amount: bigint;
  decimals: number | null;
  displayAmount: string;
  partialClaimSupported: boolean;
}

export interface ClaimableFactoryGasSummary {
  asset: ClaimableFactoryAsset | null;
  amount: bigint;
  displayAmount: string;
  available: boolean;
}

export interface FactoryAdminAccess {
  connectedAddress: string | null;
  connectedHash: string | null;
  ownerHash: string | null;
  isOwner: boolean;
  navVisible: boolean;
  routeAuthorized: boolean;
}

export type GovernanceErrorCategory =
  | "wallet_rejected"
  | "wallet_unavailable"
  | "authorization"
  | "insufficient_funds"
  | "invalid_input"
  | "rpc_failure"
  | "onchain_failure"
  | "unknown";

export interface GovernanceErrorInfo {
  category: GovernanceErrorCategory;
  message: string;
  technicalDetails: string | null;
}

export interface TokenEconomicsView {
  burnRateBps: number;
  burnRateDisplay: string;
  creatorFeeDatoshi: bigint;
  creatorFeeDisplay: string;
  platformFeeDatoshi: bigint;
  platformFeeDisplay: string;
  networkFeeDisclaimer: string;
}

export interface BurnConfirmationSummary {
  amountRaw: bigint | null;
  amountDisplay: string;
  creatorFeeDatoshi: bigint;
  creatorFeeDisplay: string;
  platformFeeDatoshi: bigint;
  platformFeeDisplay: string;
  networkFeeDisclaimer: string;
}

export interface CreationCostQuote {
  factoryFeeDatoshi: bigint;
  estimatedSystemFeeDatoshi: bigint;
  estimatedNetworkFeeDatoshi: bigint;
  estimatedChainFeeDatoshi: bigint;
  estimatedTotalWalletOutflowDatoshi: bigint;
}

export interface ContractChangeCostQuote {
  operationFeeDatoshi: bigint;
  estimatedSystemFeeDatoshi: bigint;
  estimatedNetworkFeeDatoshi: bigint;
  estimatedChainFeeDatoshi: bigint;
  estimatedTotalWalletOutflowDatoshi: bigint;
}

export interface TransferQuote {
  grossAmountRaw: bigint;
  recipientAmountRaw: bigint;
  transferBurnAmountRaw: bigint;
  totalTokenBurnedRaw: bigint;
  platformFeeDatoshi: bigint;
  creatorFeeDatoshi: bigint;
  totalGasFeeDatoshi: bigint;
  isMint: boolean;
  isDirectBurn: boolean;
}

export interface TransferConfirmationSummary {
  amountRaw: bigint | null;
  amountDisplay: string;
  recipientAmountRaw: bigint;
  recipientAmountDisplay: string;
  transferBurnAmountRaw: bigint;
  transferBurnAmountDisplay: string;
  creatorFeeDatoshi: bigint;
  creatorFeeDisplay: string;
  platformFeeDatoshi: bigint;
  platformFeeDisplay: string;
  totalGasFeeDatoshi: bigint;
  totalGasFeeDisplay: string;
  networkFeeDisclaimer: string;
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

export interface PendingTxSubmissionOptions {
  targetTokenHash?: string;
  redirectPath?: string;
  marketLaunchSummary?: MarketLaunchSummary;
}

// ---------------------------------------------------------------------------
// Forge form data
// ---------------------------------------------------------------------------

/** User-entered parameters for creating a new token. */
export interface ForgeParams {
  name: string;
  symbol: string;
  supply: bigint; // stored as bigint - never number
  decimals: number;
  mode: "community";
  imageUrl?: string; // optional icon URL - stored as metadataUri on the deployed TokenTemplate
  creatorFeeRate?: number; // optional per-transfer creator fee in datoshi
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

export interface RpcSigner {
  account: string;
  scopes: "None" | "CalledByEntry" | "CustomContracts" | "CustomGroups" | "Global";
  allowedContracts?: string[];
  allowedGroups?: string[];
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
