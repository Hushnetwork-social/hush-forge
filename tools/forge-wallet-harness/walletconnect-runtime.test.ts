// @vitest-environment node

import UniversalProvider from "@walletconnect/universal-provider";
import { afterEach, describe, expect, it } from "vitest";
import { loadForgeWalletHarnessConfig } from "./config";
import {
  NEO3_WALLETCONNECT_EVENTS,
  NEO3_WALLETCONNECT_METHODS,
} from "./constants";
import {
  type LocalWalletConnectRelay,
  startLocalWalletConnectRelay,
} from "./local-relay";
import {
  type WalletConnectHarnessRuntime,
  startWalletConnectHarnessRuntime,
} from "./walletconnect-runtime";

describe("walletconnect harness runtime", () => {
  let relay: LocalWalletConnectRelay | null = null;
  let runtime: WalletConnectHarnessRuntime | null = null;

  afterEach(async () => {
    await runtime?.close();
    await relay?.close();
    runtime = null;
    relay = null;
  });

  it("pairs through the local relay and answers getWalletInfo", async () => {
    relay = await startLocalWalletConnectRelay(0);
    const config = loadForgeWalletHarnessConfig({
      FORGE_WALLET_HARNESS_RELAY_URL: relay.url,
      FORGE_WALLET_HARNESS_REOWN_PROJECT_ID: "forge-local-project",
    });
    runtime = await startWalletConnectHarnessRuntime(config, {
      projectId: config.projectId,
      relayUrl: relay.url,
      storagePrefix: `forge-walletkit-test-${Date.now()}`,
    });
    const provider = await UniversalProvider.init({
      disableProviderPing: true,
      projectId: config.projectId,
      relayUrl: relay.url,
    });

    provider.on("display_uri", (uri: string) => {
      void runtime?.pair(uri);
    });

    await provider.connect({
      optionalNamespaces: {
        neo3: {
          chains: [config.chainId],
          events: [...NEO3_WALLETCONNECT_EVENTS],
          methods: [...NEO3_WALLETCONNECT_METHODS],
        },
      },
    });

    const walletInfo = await provider.request(
      { method: "getWalletInfo", params: [] },
      config.chainId
    );

    expect(walletInfo).toMatchObject({
      address: config.account.address,
      chainId: config.chainId,
      expectedMagic: config.expectedMagic,
      isLedger: false,
      rpcUrl: config.rpcUrl,
      scriptHash: config.account.scriptHash,
    });
  }, 30_000);
});
