"use client";

import {
  EXPECTED_NEO_PRIVATE_NETWORK_MAGIC,
  PRIVATE_NET_RPC_URL,
  REOWN_PROJECT_ID,
  REOWN_RELAY_URL,
  WALLETCONNECT_HARNESS_PAIR_URL,
} from "./forge-config";
import type { NeoWalletInvocationRequest } from "./wallet-invocation-requests";

interface NeoDapiAccount {
  address: string;
}

interface NeoDapiInvokeResult {
  txid: string;
  nodeURL?: string;
}

interface NeoDapiBalanceResult {
  address: string;
  balances: [];
}

interface WalletConnectProviderLike {
  connect(): Promise<string>;
  invokeFunction(params: {
    invocations: Array<{
      args: NeoWalletInvocationRequest["args"];
      operation: string;
      scriptHash: string;
    }>;
    signers: NeoWalletInvocationRequest["signers"];
  }): Promise<string | { txid?: string }>;
  request?<T>(args: { method: string; params?: unknown }): Promise<T>;
}

interface WalletConnectSessionNamespaceLike {
  accounts?: string[];
}

interface WalletConnectSessionLike {
  namespaces?: Record<string, WalletConnectSessionNamespaceLike>;
}

interface UniversalProviderLike {
  session?: WalletConnectSessionLike;
  connect(params: {
    optionalNamespaces: Record<string, unknown>;
  }): Promise<WalletConnectSessionLike>;
  request<T>(
    args: { method: string; params?: unknown },
    chainId?: string
  ): Promise<T>;
}

interface WalletConnectDapiLike {
  AddNEP17(params: { decimals: number; scriptHash: string; symbol: string }): Promise<void>;
  getAccount(): Promise<NeoDapiAccount>;
  getBalance(): Promise<NeoDapiBalanceResult[]>;
  getNetworks(): Promise<{ defaultNetwork: string; networks: string[] }>;
  invoke(params: NeoWalletInvocationRequest): Promise<NeoDapiInvokeResult>;
  pickAddress(): Promise<NeoDapiAccount>;
}

declare global {
  interface Window {
    __FORGE_LAST_WALLETCONNECT_URI?: string;
    __FORGE_WALLETCONNECT_PAIR_URI?: (uri: string) => Promise<void> | void;
  }
}

let connectPromise: Promise<WalletConnectDapiLike> | null = null;
let connectedDapi: WalletConnectDapiLike | null = null;
const WALLETCONNECT_CONNECT_TIMEOUT_MS = 180_000;

export function isWalletConnectRuntimeConfigured(): boolean {
  return Boolean(REOWN_PROJECT_ID.trim());
}

export async function connectWalletConnectAppKit(): Promise<WalletConnectDapiLike> {
  if (connectedDapi) return connectedDapi;
  if (connectPromise) return connectPromise;

  connectPromise = createWalletConnectDapi().then((dapi) => {
    connectedDapi = dapi;
    return dapi;
  });

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

async function createWalletConnectDapi(): Promise<WalletConnectDapiLike> {
  if (!isWalletConnectRuntimeConfigured()) {
    throw new Error(
      "WalletConnect/AppKit requires NEXT_PUBLIC_REOWN_PROJECT_ID."
    );
  }

  const [
    { Neo3Adapter, Neo3Constants },
    { createAppKit },
    { default: UniversalProvider },
  ] = await Promise.all([
    import("@cityofzion/appkit-neo3-adapter"),
    import("@reown/appkit/react"),
    import("@walletconnect/universal-provider"),
  ]);

  const neo3PrivateNetwork = buildNeo3PrivateNetwork();
  const appKitNetwork = neo3PrivateNetwork as never;
  const appKitNetworks = [neo3PrivateNetwork] as never;
  const walletConnectMethods = [
    ...new Set([...Neo3Constants.METHODS, "getNetworkVersion"]),
  ];
  const walletConnectNamespaces = {
    neo3: {
      chains: ["neo3:private"],
      events: [...Neo3Constants.EVENTS],
      methods: walletConnectMethods,
      rpcMap: {
        private: getWalletConnectRpcUrl(),
      },
    },
  };
  const universalProviderConfigOverride = {
    ...Neo3Constants.OVERRIDES,
    chains: {
      ...Neo3Constants.OVERRIDES.chains,
      neo3: ["neo3:private"],
    },
    events: {
      ...Neo3Constants.OVERRIDES.events,
      neo3: [...Neo3Constants.EVENTS],
    },
    methods: {
      ...Neo3Constants.OVERRIDES.methods,
      neo3: walletConnectMethods,
    },
    rpcMap: {
      ...Neo3Constants.OVERRIDES.rpcMap,
      "neo3:private": getWalletConnectRpcUrl(),
    },
  };
  const universalProvider = await UniversalProvider.init({
    disableProviderPing: true,
    metadata: {
      description: "FORGE token launcher WalletConnect proof of work.",
      icons: [],
      name: "FORGE",
      url: window.location.origin,
    },
    projectId: REOWN_PROJECT_ID,
    relayUrl: REOWN_RELAY_URL,
  });

  universalProvider.on("display_uri", (uri: string) => {
    window.__FORGE_LAST_WALLETCONNECT_URI = uri;
    window.dispatchEvent(new CustomEvent("forge:walletconnect-uri", { detail: uri }));
    void window.__FORGE_WALLETCONNECT_PAIR_URI?.(uri);
    void pairWithLocalHarness(uri);
  });

  const neo3Adapter = new Neo3Adapter({
    namespace: "neo3" as never,
    networks: appKitNetworks,
    projectId: REOWN_PROJECT_ID,
  });

  createAppKit({
    adapters: [neo3Adapter],
    defaultNetwork: appKitNetwork,
    enableCoinbase: false,
    enableInjected: false,
    enableReconnect: false,
    features: {
      analytics: false,
      email: false,
      onramp: false,
      pay: false,
      receive: false,
      send: false,
      socials: false,
      swaps: false,
    },
    metadata: {
      description: "FORGE token launcher WalletConnect proof of work.",
      icons: [],
      name: "FORGE",
      url: window.location.origin,
    },
    networks: appKitNetworks,
    projectId: REOWN_PROJECT_ID,
    universalProvider: universalProvider as never,
    universalProviderConfigOverride: universalProviderConfigOverride as never,
  });
  await neo3Adapter.setUniversalProvider(universalProvider as never);

  const session = getReusableNeo3Session(universalProvider as UniversalProviderLike) ??
    await withWalletConnectTimeout(
      (universalProvider as UniversalProviderLike).connect({
        optionalNamespaces: walletConnectNamespaces,
      }),
      "WalletConnect/AppKit connection timed out."
    );
  const provider = createUniversalProviderBridge(
    universalProvider as UniversalProviderLike,
    session
  );
  const address = await withWalletConnectTimeout(
    provider.connect(),
    "WalletConnect/AppKit connection timed out."
  );

  if (!address) {
    throw new Error("WalletConnect/AppKit connected without an account address.");
  }

  await assertPrivateNetwork(provider as WalletConnectProviderLike);

  return createDapi(address, provider as WalletConnectProviderLike);
}

function getReusableNeo3Session(
  universalProvider: UniversalProviderLike
): WalletConnectSessionLike | null {
  const session = universalProvider.session;
  if (!session) return null;

  try {
    extractNeo3Address(session);
    return session;
  } catch {
    return null;
  }
}

function createUniversalProviderBridge(
  universalProvider: UniversalProviderLike,
  session: WalletConnectSessionLike
): WalletConnectProviderLike {
  const address = extractNeo3Address(session);

  return {
    connect: async () => address,
    invokeFunction: async (params) =>
      universalProvider.request<string | { txid?: string }>(
        { method: "invokeFunction", params },
        "neo3:private"
      ),
    request: async <T,>(args: { method: string; params?: unknown }) =>
      universalProvider.request<T>(args, "neo3:private"),
  };
}

function extractNeo3Address(session: WalletConnectSessionLike): string {
  const namespaces = session.namespaces ?? {};
  const accounts = Object.values(namespaces).flatMap(
    (namespace) => namespace.accounts ?? []
  );
  const account =
    accounts.find((candidate) => candidate.startsWith("neo3:private:")) ??
    accounts.find((candidate) => candidate.startsWith("neo3:"));

  if (!account) {
    throw new Error("WalletConnect/AppKit connected without a Neo3 account.");
  }

  const [, , address] = account.split(":");
  if (!address) {
    throw new Error("WalletConnect/AppKit connected with an invalid Neo3 account.");
  }

  return address;
}

function createDapi(
  address: string,
  provider: WalletConnectProviderLike
): WalletConnectDapiLike {
  return {
    AddNEP17: async () => {},
    getAccount: async () => ({ address }),
    getBalance: async () => [{ address, balances: [] }],
    getNetworks: async () => ({
      defaultNetwork: "PrivateNet",
      networks: ["PrivateNet"],
    }),
    invoke: async (params) => {
      const result = await provider.invokeFunction({
        invocations: [
          {
            args: params.args,
            operation: params.operation,
            scriptHash: params.scriptHash,
          },
        ],
        signers: params.signers,
      });

      return {
        nodeURL: PRIVATE_NET_RPC_URL,
        txid: typeof result === "string" ? result : result.txid ?? "",
      };
    },
    pickAddress: async () => ({ address }),
  };
}

function buildNeo3PrivateNetwork() {
  return {
    id: "private",
    caipNetworkId: "neo3:private",
    chainNamespace: "neo3",
    name: "Neo PrivateNet",
    nativeCurrency: {
      decimals: 8,
      name: "GAS",
      symbol: "GAS",
    },
    rpcUrls: {
      default: {
        http: [getWalletConnectRpcUrl()],
      },
    },
    testnet: true,
  } as const;
}

function getWalletConnectRpcUrl(): string {
  if (/^https?:\/\//iu.test(PRIVATE_NET_RPC_URL)) {
    return PRIVATE_NET_RPC_URL;
  }

  if (typeof window !== "undefined") {
    return new URL(PRIVATE_NET_RPC_URL || "/api/rpc", window.location.origin)
      .href;
  }

  return "http://localhost:3000/api/rpc";
}

function withWalletConnectTimeout<T>(
  promise: Promise<T>,
  message: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(message)),
        WALLETCONNECT_CONNECT_TIMEOUT_MS
      )
    ),
  ]);
}

async function assertPrivateNetwork(
  provider: WalletConnectProviderLike
): Promise<void> {
  if (typeof provider.request !== "function") return;

  const version = await provider.request<{
    protocol?: { network?: number | string };
    rpcAddress?: string;
  }>({
    method: "getNetworkVersion",
    params: [],
  });
  const networkMagic = Number(version.protocol?.network);

  if (networkMagic !== EXPECTED_NEO_PRIVATE_NETWORK_MAGIC) {
    throw new Error(
      `WalletConnect wallet is not on the expected Neo private network. Expected magic ${EXPECTED_NEO_PRIVATE_NETWORK_MAGIC}, got ${networkMagic || "unknown"}.`
    );
  }
}

async function pairWithLocalHarness(uri: string): Promise<void> {
  if (!WALLETCONNECT_HARNESS_PAIR_URL.trim()) {
    return;
  }

  const response = await fetch(WALLETCONNECT_HARNESS_PAIR_URL, {
    body: JSON.stringify({ uri }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `WalletConnect harness pair endpoint failed with ${response.status}.`
    );
  }
}
