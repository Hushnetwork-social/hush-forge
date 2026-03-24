import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useForgeForm } from "./useForgeForm";

// Mock dependencies
vi.mock("../forge-service", () => ({
  fetchCreationFee: vi.fn(),
  quoteCreationCost: vi.fn(),
  checkSymbolAvailability: vi.fn(),
  submitForge: vi.fn(),
}));

vi.mock("../neo-dapi-adapter", () => ({
  WalletRejectedError: class WalletRejectedError extends Error {
    constructor(message = "User rejected the transaction") {
      super(message);
      this.name = "WalletRejectedError";
    }
  },
}));

import {
  checkSymbolAvailability as mockCheckSymbolAvailability,
  fetchCreationFee as mockFetchFee,
  quoteCreationCost as mockQuoteCreationCost,
  submitForge as mockSubmitForge,
} from "../forge-service";
import { WalletRejectedError } from "../neo-dapi-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_FEE = { datoshi: 1_500_000_000n, displayGas: "15" };
const DEFAULT_CREATION_QUOTE = {
  factoryFeeDatoshi: 1_500_000_000n,
  estimatedSystemFeeDatoshi: 1_157_121_145n,
  estimatedNetworkFeeDatoshi: 1_275_520n,
  estimatedChainFeeDatoshi: 1_158_396_665n,
  estimatedTotalWalletOutflowDatoshi: 2_658_396_665n,
};

/** Renders hook with fee pre-loaded (feeLoading = false). */
async function renderWithFeeLoaded(
  address: string | null = "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c",
  gasBalance = 3_000_000_000n
) {
  vi.mocked(mockFetchFee).mockResolvedValue(DEFAULT_FEE);
  const hook = renderHook(() => useForgeForm(address, gasBalance));
  // Wait for fee load effect to complete
  await waitFor(() =>
    expect(hook.result.current.feeLoading).toBe(false)
  );
  return hook;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useForgeForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mockCheckSymbolAvailability).mockResolvedValue({ available: true });
    vi.mocked(mockQuoteCreationCost).mockResolvedValue(DEFAULT_CREATION_QUOTE);
  });

  // -------------------------------------------------------------------------
  // Field setters
  // -------------------------------------------------------------------------

  it("setSymbol auto-uppercases input", () => {
    // Never-resolving fee prevents async state updates from firing during this test
    vi.mocked(mockFetchFee).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useForgeForm(null, 0n));

    act(() => {
      result.current.setSymbol("hush");
    });

    expect(result.current.symbol).toBe("HUSH");
  });

  it("setName stores the value as-is", () => {
    vi.mocked(mockFetchFee).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useForgeForm(null, 0n));

    act(() => {
      result.current.setName("Hush Token");
    });

    expect(result.current.name).toBe("Hush Token");
  });

  // -------------------------------------------------------------------------
  // Fee loading
  // -------------------------------------------------------------------------

  it("fetches fee on mount and updates state", async () => {
    vi.mocked(mockFetchFee).mockResolvedValue({ datoshi: 1_500_000_000n, displayGas: "15" });

    const { result } = renderHook(() => useForgeForm(null, 0n));

    expect(result.current.feeLoading).toBe(true);

    await waitFor(() => expect(result.current.feeLoading).toBe(false));

    expect(result.current.creationFeeDisplay).toBe("15");
    expect(result.current.creationFeeDatoshi).toBe(1_500_000_000n);
  });

  // -------------------------------------------------------------------------
  // GAS check
  // -------------------------------------------------------------------------

  it("gasCheckResult is sufficient when balance exceeds fee + 10% buffer", async () => {
    const { result } = await renderWithFeeLoaded(null, 2_000_000_000n);

    // required = 1.5 GAS + 10% = 1.65 GAS = 1_650_000_000
    expect(result.current.gasCheckResult?.sufficient).toBe(true);
    expect(result.current.gasCheckResult?.required).toBe(1_650_000_000n);
  });

  it("gasCheckResult is insufficient when balance is below fee + buffer", async () => {
    const { result } = await renderWithFeeLoaded(null, 500_000_000n);

    expect(result.current.gasCheckResult?.sufficient).toBe(false);
    expect(result.current.gasCheckResult?.actual).toBe(500_000_000n);
  });

  it("gasCheckResult is null while fee is loading", () => {
    vi.mocked(mockFetchFee).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useForgeForm(null, 0n));
    expect(result.current.gasCheckResult).toBeNull();
  });

  it("loads a creation-cost quote for a valid connected form and uses the total as the required GAS", async () => {
    const { result } = await renderWithFeeLoaded(
      "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c",
      3_000_000_000n
    );

    await act(async () => {
      result.current.setName("OneToken");
      result.current.setSymbol("ONE");
      result.current.setSupply("1000000");
      result.current.setDecimals("8");
      result.current.setCreatorFee("0.05");
    });

    await waitFor(() => expect(result.current.creationCostLoading).toBe(false));
    await waitFor(() =>
      expect(result.current.creationCostQuote?.estimatedTotalWalletOutflowDatoshi).toBe(
        DEFAULT_CREATION_QUOTE.estimatedTotalWalletOutflowDatoshi
      )
    );

    expect(mockQuoteCreationCost).toHaveBeenCalledTimes(1);
    expect(result.current.gasCheckResult?.required).toBe(
      DEFAULT_CREATION_QUOTE.estimatedTotalWalletOutflowDatoshi
    );
    expect(result.current.canSubmit).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Validation (triggered via submit)
  // -------------------------------------------------------------------------

  it("symbol with numbers fails validation", async () => {
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH1"); // already uppercased, but has digit
      result.current.setSupply("1000000");
      result.current.setDecimals("8");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.symbol).toBe(
      "Symbol must be 2-10 uppercase letters only"
    );
    expect(vi.mocked(mockSubmitForge)).not.toHaveBeenCalled();
  });

  it("zero supply fails validation", async () => {
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("0");
      result.current.setDecimals("8");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.supply).toBe("Supply must be a positive integer");
    expect(vi.mocked(mockSubmitForge)).not.toHaveBeenCalled();
  });

  it("decimals out of range fails validation", async () => {
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("1000000");
      result.current.setDecimals("19"); // > 18
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.decimals).toBe(
      "Decimals must be an integer between 0 and 18"
    );
    expect(vi.mocked(mockSubmitForge)).not.toHaveBeenCalled();
  });

  it("non-http imageUrl fails validation", async () => {
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("1000000");
      result.current.setDecimals("8");
      result.current.setImageUrl("ftp://invalid-url.com/icon.png");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.imageUrl).toBe("Must be a valid http/https URL");
    expect(vi.mocked(mockSubmitForge)).not.toHaveBeenCalled();
  });

  it("empty imageUrl passes validation (optional field)", async () => {
    vi.mocked(mockSubmitForge).mockResolvedValue("0xtxhash");
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("1000000");
      result.current.setDecimals("8");
      // imageUrl stays empty — default ""
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.imageUrl).toBeUndefined();
    expect(vi.mocked(mockSubmitForge)).toHaveBeenCalled();
  });

  it("valid https imageUrl passes validation", async () => {
    vi.mocked(mockSubmitForge).mockResolvedValue("0xtxhash");
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("1000000");
      result.current.setDecimals("8");
      result.current.setImageUrl("https://example.com/icon.png");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.imageUrl).toBeUndefined();
    expect(vi.mocked(mockSubmitForge)).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: "https://example.com/icon.png" }),
      expect.any(BigInt)
    );
  });

  it("empty name fails validation", async () => {
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setSymbol("HUSH");
      result.current.setSupply("1000000");
      result.current.setDecimals("8");
      // name stays empty
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.name).toBe("Name is required");
    expect(vi.mocked(mockSubmitForge)).not.toHaveBeenCalled();
  });

  it("valid form has no errors after submit", async () => {
    vi.mocked(mockSubmitForge).mockResolvedValue("0xtxhash");
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("10000000");
      result.current.setDecimals("8");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors).toEqual({});
  });

  it("duplicate symbol fails before wallet invoke", async () => {
    vi.mocked(mockCheckSymbolAvailability).mockResolvedValue({
      available: false,
      reason: "Symbol HUSH is already in use by 0xabc.",
    });
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("10000000");
      result.current.setDecimals("8");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.symbol).toBe(
      "Symbol HUSH is already in use by 0xabc."
    );
    expect(vi.mocked(mockSubmitForge)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Submit orchestration
  // -------------------------------------------------------------------------

  it("successful submit sets submittedTxHash", async () => {
    vi.mocked(mockSubmitForge).mockResolvedValue("0xtxhash123");
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("10000000");
      result.current.setDecimals("8");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.submittedTxHash).toBe("0xtxhash123");
    expect(result.current.submitError).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it("wallet rejection sets submitError and clears txHash", async () => {
    vi.mocked(mockSubmitForge).mockRejectedValue(
      new WalletRejectedError()
    );
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("10000000");
      result.current.setDecimals("8");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.submitError).toBe(
      "Transaction cancelled. Please try again."
    );
    expect(result.current.submittedTxHash).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it("shows friendly symbol error when chain rejects duplicate symbol", async () => {
    vi.mocked(mockSubmitForge).mockRejectedValue({
      type: "RPC_ERROR",
      description: "Symbol already exists",
    });
    const { result } = await renderWithFeeLoaded();

    await act(async () => {
      result.current.setName("HushToken");
      result.current.setSymbol("HUSH");
      result.current.setSupply("10000000");
      result.current.setDecimals("8");
    });

    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors.symbol).toBe(
      "Symbol HUSH is already in use. Choose a different symbol."
    );
    expect(result.current.submitError).toBe(
      "Symbol HUSH is already in use. Choose a different symbol."
    );
  });
});
