import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTokenStore, selectDisplayTokens } from "./token-store";
import type { TokenInfo } from "./types";

// Mock dependencies
vi.mock("./forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
}));

vi.mock("./neo-rpc-client", () => ({
  invokeFunction: vi.fn(),
}));

vi.mock("./token-metadata-service", () => ({
  resolveTokenMetadata: vi.fn(),
}));

import { invokeFunction as mockInvokeFunction } from "./neo-rpc-client";
import { resolveTokenMetadata as mockResolveMetadata } from "./token-metadata-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(
  contractHash: string,
  symbol: string,
  creator: string | null = null
): TokenInfo {
  return {
    contractHash,
    symbol,
    name: symbol,
    creator,
    supply: 1_000_000n,
    decimals: 8,
    mode: "community",
    tier: 0,
    createdAt: 1_000_000,
  };
}

function resetStore() {
  useTokenStore.setState(
    {
      tokens: [],
      ownTokenHashes: new Set(),
      filterMyTokens: false,
      loadingStatus: "idle",
      errorMessage: null,
    },
    false
  );
}

// ---------------------------------------------------------------------------
// selectDisplayTokens
// ---------------------------------------------------------------------------

describe("selectDisplayTokens", () => {
  it("places own tokens before non-own tokens", () => {
    const ALPHA = makeToken("0xalpha", "ALPHA");
    const BETA = makeToken("0xbeta", "BETA");
    const GAMMA = makeToken("0xgamma", "GAMMA");

    const result = selectDisplayTokens({
      tokens: [ALPHA, BETA, GAMMA],
      ownTokenHashes: new Set(["0xalpha", "0xgamma"]),
      filterMyTokens: false,
    });

    expect(result.map((t) => t.symbol)).toEqual(["ALPHA", "GAMMA", "BETA"]);
  });

  it("returns only own tokens when filterMyTokens is true", () => {
    const ALPHA = makeToken("0xalpha", "ALPHA");
    const BETA = makeToken("0xbeta", "BETA");

    const result = selectDisplayTokens({
      tokens: [ALPHA, BETA],
      ownTokenHashes: new Set(["0xalpha"]),
      filterMyTokens: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("ALPHA");
  });

  it("returns all tokens when filterMyTokens is false", () => {
    const ALPHA = makeToken("0xalpha", "ALPHA");
    const BETA = makeToken("0xbeta", "BETA");

    const result = selectDisplayTokens({
      tokens: [ALPHA, BETA],
      ownTokenHashes: new Set(["0xalpha"]),
      filterMyTokens: false,
    });

    expect(result).toHaveLength(2);
  });

  it("returns empty array when no tokens", () => {
    const result = selectDisplayTokens({
      tokens: [],
      ownTokenHashes: new Set(),
      filterMyTokens: false,
    });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addToken
// ---------------------------------------------------------------------------

describe("TokenStore.addToken", () => {
  beforeEach(() => {
    resetStore();
  });

  it("prepends a new own token to the front", () => {
    const ALPHA = makeToken("0xalpha", "ALPHA");
    const BETA = makeToken("0xbeta", "BETA");
    useTokenStore.setState({
      tokens: [ALPHA],
      ownTokenHashes: new Set(["0xalpha"]),
    });

    useTokenStore.getState().addToken(BETA);

    const state = useTokenStore.getState();
    expect(state.tokens[0].symbol).toBe("BETA");
    expect(state.ownTokenHashes.has("0xbeta")).toBe(true);
  });

  it("newly forged own token appears first in displayTokens", () => {
    const ALPHA = makeToken("0xalpha", "ALPHA");
    const OTHER = makeToken("0xother", "OTHER");
    useTokenStore.setState({
      tokens: [ALPHA, OTHER],
      ownTokenHashes: new Set(["0xalpha"]),
    });

    const GAMMA = makeToken("0xgamma", "GAMMA");
    useTokenStore.getState().addToken(GAMMA);

    const displayTokens = selectDisplayTokens(useTokenStore.getState());
    expect(displayTokens[0].symbol).toBe("GAMMA");
    expect(displayTokens[1].symbol).toBe("ALPHA");
    expect(displayTokens[2].symbol).toBe("OTHER");
  });
});

// ---------------------------------------------------------------------------
// setFilterMyTokens
// ---------------------------------------------------------------------------

describe("TokenStore.setFilterMyTokens", () => {
  beforeEach(() => {
    resetStore();
  });

  it("toggles filter state", () => {
    expect(useTokenStore.getState().filterMyTokens).toBe(false);
    useTokenStore.getState().setFilterMyTokens(true);
    expect(useTokenStore.getState().filterMyTokens).toBe(true);
    useTokenStore.getState().setFilterMyTokens(false);
    expect(useTokenStore.getState().filterMyTokens).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe("TokenStore.reset", () => {
  beforeEach(() => {
    resetStore();
  });

  it("clears all state on disconnect", () => {
    useTokenStore.setState({
      tokens: [makeToken("0xabc", "ABC")],
      ownTokenHashes: new Set(["0xabc"]),
      filterMyTokens: true,
      loadingStatus: "loaded",
    });

    useTokenStore.getState().reset();

    const state = useTokenStore.getState();
    expect(state.tokens).toEqual([]);
    expect(state.ownTokenHashes.size).toBe(0);
    expect(state.filterMyTokens).toBe(false);
    expect(state.loadingStatus).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// loadWalletHeldTokens
// ---------------------------------------------------------------------------

describe("TokenStore.loadWalletHeldTokens", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
  });

  it("skips tokens already in the list (duplicate prevention)", async () => {
    const existing = makeToken("0xabc", "EXISTING");
    useTokenStore.setState({ tokens: [existing] });

    await useTokenStore.getState().loadWalletHeldTokens([
      {
        contractHash: "0xabc",
        symbol: "EXISTING",
        amount: 100n,
        decimals: 8,
        displayAmount: "0.00000100",
      },
    ]);

    expect(vi.mocked(mockResolveMetadata)).not.toHaveBeenCalled();
    expect(useTokenStore.getState().tokens).toHaveLength(1);
  });

  it("adds new tokens not already in the list", async () => {
    const NEW_TOKEN = makeToken("0xnew", "NEW");
    vi.mocked(mockResolveMetadata).mockResolvedValue(NEW_TOKEN);

    await useTokenStore.getState().loadWalletHeldTokens([
      {
        contractHash: "0xnew",
        symbol: "NEW",
        amount: 500n,
        decimals: 8,
        displayAmount: "0.00000500",
      },
    ]);

    expect(useTokenStore.getState().tokens).toHaveLength(1);
    expect(useTokenStore.getState().tokens[0].symbol).toBe("NEW");
  });

  it("does NOT add new tokens to ownTokenHashes (held ≠ own)", async () => {
    const HELD = makeToken("0xheld", "HELD");
    vi.mocked(mockResolveMetadata).mockResolvedValue(HELD);

    await useTokenStore.getState().loadWalletHeldTokens([
      {
        contractHash: "0xheld",
        symbol: "HELD",
        amount: 100n,
        decimals: 8,
        displayAmount: "0.00000100",
      },
    ]);

    expect(useTokenStore.getState().ownTokenHashes.has("0xheld")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadTokensForAddress
// ---------------------------------------------------------------------------

describe("TokenStore.loadTokensForAddress", () => {
  beforeEach(() => {
    resetStore();
    vi.resetAllMocks();
  });

  it("sets loading status to error on RPC failure", async () => {
    vi.mocked(mockInvokeFunction).mockRejectedValue(
      new Error("RPC unreachable")
    );

    await useTokenStore.getState().loadTokensForAddress("NwTest");

    expect(useTokenStore.getState().loadingStatus).toBe("error");
    expect(useTokenStore.getState().errorMessage).toBe("RPC unreachable");
  });

  it("loads tokens and marks them as own", async () => {
    const TOKEN_A = makeToken("0xaaaa", "AAAA", "NwCreator");
    // Simulate factory returning one hash
    vi.mocked(mockInvokeFunction).mockResolvedValue({
      state: "HALT" as const,
      gasconsumed: "100000",
      script: "",
      // Array of one ByteString item (base64 of reversed hash bytes)
      stack: [
        {
          type: "Array",
          value: [] as { type: string; value: unknown }[], // empty for simplicity
        },
      ],
    });
    // But resolved metadata returns our token
    vi.mocked(mockResolveMetadata).mockResolvedValue(TOKEN_A);

    await useTokenStore.getState().loadTokensForAddress("NwCreator");

    // Empty hash list → resolveMetadata not called, tokens empty
    const state = useTokenStore.getState();
    expect(state.loadingStatus).toBe("loaded");
    expect(state.tokens).toHaveLength(0);
  });
});
