import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTokenDetail } from "./useTokenDetail";
import { useWalletStore, WALLET_INITIAL_STATE } from "../wallet-store";
import type { TokenInfo } from "../types";

vi.mock("../token-metadata-service", () => ({
  resolveTokenMetadata: vi.fn(),
}));

vi.mock("../forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
}));

vi.mock("../neo-rpc-client", () => ({
  invokeFunction: vi.fn(),
  addressToHash160: vi.fn(() => {
    throw new Error("stub - not a real address");
  }),
}));

import { resolveTokenMetadata as mockResolve } from "../token-metadata-service";
import { addressToHash160 as mockAddressToHash160 } from "../neo-rpc-client";

function makeToken(contractHash: string, creator: string | null): TokenInfo {
  return {
    contractHash,
    symbol: "HUSH",
    name: "HushToken",
    creator,
    supply: 10_000_000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
  };
}

function resetStore() {
  useWalletStore.setState({ ...WALLET_INITIAL_STATE }, false);
}

describe("useTokenDetail", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
  });

  it("loads token metadata and sets loading to false", async () => {
    const token = makeToken("0xabc", "NwCreator");
    vi.mocked(mockResolve).mockResolvedValue(token);

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.token).toEqual(token);
    expect(result.current.economics?.burnRateDisplay).toBe("0.00%");
    expect(result.current.error).toBeNull();
  });

  it("isOwnToken is true when creator matches connected address", async () => {
    const token = makeToken("0xabc", "NwCreator");
    vi.mocked(mockResolve).mockResolvedValue(token);
    useWalletStore.setState({ address: "NwCreator" });

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwnToken).toBe(true);
  });

  it("isOwnToken is true when creator matches the wallet hash in canonical form", async () => {
    const token = makeToken("0xabc", "0x88c48eaef7e64b646440da567cd85c9060efbf63");
    vi.mocked(mockResolve).mockResolvedValue(token);
    vi.mocked(mockAddressToHash160).mockReturnValue(token.creator as string);
    useWalletStore.setState({ address: "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c" });

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwnToken).toBe(true);
  });

  it("isOwnToken stays true when creator is stored in the legacy reversed-byte form", async () => {
    const token = makeToken("0xabc", "0x63bfef60905cd87c56da4064644be6f7ae8ec488");
    vi.mocked(mockResolve).mockResolvedValue(token);
    vi.mocked(mockAddressToHash160).mockReturnValue("0x88c48eaef7e64b646440da567cd85c9060efbf63");
    useWalletStore.setState({ address: "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c" });

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwnToken).toBe(true);
  });

  it("isOwnToken is false for third-party tokens", async () => {
    const token = makeToken("0xabc", "NwOther");
    vi.mocked(mockResolve).mockResolvedValue(token);
    useWalletStore.setState({ address: "NwMe" });

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwnToken).toBe(false);
  });

  it("isOwnToken is false when creator is null (non-factory token)", async () => {
    const token = makeToken("0xabc", null);
    vi.mocked(mockResolve).mockResolvedValue(token);
    useWalletStore.setState({ address: "NwMe" });

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isOwnToken).toBe(false);
  });

  it("isUpgradeable is true for community mode tokens", async () => {
    vi.mocked(mockResolve).mockResolvedValue(makeToken("0xabc", null));

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isUpgradeable).toBe(true);
  });

  it("isUpgradeable is false for non-community (null) mode tokens", async () => {
    const token = { ...makeToken("0xabc", null), mode: null } as TokenInfo;
    vi.mocked(mockResolve).mockResolvedValue(token);

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isUpgradeable).toBe(false);
  });

  it("returns null economics for non-factory tokens", async () => {
    vi.mocked(mockResolve).mockResolvedValue(makeToken("0xabc", null));

    const { result } = renderHook(() => useTokenDetail("0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.economics).toBeNull();
  });
});
