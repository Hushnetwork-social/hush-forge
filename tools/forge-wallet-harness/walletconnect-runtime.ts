import { Core } from "@walletconnect/core";
import {
  formatJsonRpcError,
  formatJsonRpcResult,
} from "@walletconnect/jsonrpc-utils";
import { WalletKit, type WalletKitTypes } from "@reown/walletkit";
import type { ForgeWalletHarnessConfig } from "./config";
import {
  buildHarnessWalletInfo,
  buildNeo3SessionNamespaces,
} from "./session";
import {
  signAndSubmitNeoInvocation,
  type NeoInvocationRequest,
} from "./neo-invocation";

export interface WalletConnectHarnessRuntimeOptions {
  projectId: string;
  relayUrl: string;
  storagePrefix?: string;
}

export interface WalletConnectHarnessRuntime {
  close(): Promise<void>;
  pair(uri: string): Promise<void>;
}

export async function startWalletConnectHarnessRuntime(
  config: ForgeWalletHarnessConfig,
  options: WalletConnectHarnessRuntimeOptions
): Promise<WalletConnectHarnessRuntime> {
  const core = new Core({
    customStoragePrefix:
      options.storagePrefix ?? `forge-wallet-harness-${Date.now()}`,
    projectId: options.projectId,
    relayUrl: options.relayUrl,
  });
  const walletKit = await WalletKit.init({
    core,
    metadata: {
      description: "FORGE WalletConnect test wallet harness.",
      icons: [],
      name: config.metadata.name,
      url: config.metadata.url,
    },
  });

  walletKit.on("session_proposal", async (proposal) => {
    await walletKit.approveSession({
      id: proposal.id,
      namespaces: buildNeo3SessionNamespaces(config),
    });
  });

  walletKit.on("session_request", async (event) => {
    await handleSessionRequest(walletKit, config, event);
  });

  return {
    close: async () => {
      const sessions = Object.values(walletKit.getActiveSessions());
      await Promise.all(
        sessions.map((session) =>
          walletKit
            .disconnectSession({
              reason: {
                code: 6000,
                message: "FORGE wallet harness closed.",
              },
              topic: session.topic,
            })
            .catch(() => undefined)
        )
      );
    },
    pair: (uri: string) => walletKit.pair({ uri }),
  };
}

async function handleSessionRequest(
  walletKit: Awaited<ReturnType<typeof WalletKit.init>>,
  config: ForgeWalletHarnessConfig,
  event: WalletKitTypes.SessionRequest
): Promise<void> {
  const { id, topic, params } = event;
  const { request } = params;

  try {
    if (request.method === "invokeFunction") {
      const result = await signAndSubmitNeoInvocation({
        config,
        request: request.params as NeoInvocationRequest,
      });
      await walletKit.respondSessionRequest({
        response: formatJsonRpcResult(id, result.txid),
        topic,
      });
      return;
    }

    if (request.method === "getWalletInfo") {
      await walletKit.respondSessionRequest({
        response: formatJsonRpcResult(id, buildHarnessWalletInfo(config)),
        topic,
      });
      return;
    }

    await walletKit.respondSessionRequest({
      response: formatJsonRpcError(
        id,
        `FORGE wallet harness does not implement ${request.method}.`
      ),
      topic,
    });
  } catch (error) {
    await walletKit.respondSessionRequest({
      response: formatJsonRpcError(
        id,
        error instanceof Error ? error.message : String(error)
      ),
      topic,
    });
  }
}
