import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ForgeOverlay } from "./ForgeOverlay";
import { useForgeForm } from "../hooks/useForgeForm";
import type { UseForgeFormResult } from "../hooks/useForgeForm";

vi.mock("../hooks/useForgeForm", () => ({
  useForgeForm: vi.fn(),
}));

// useForgeForm internally imports forge-service and neo-dapi-adapter
vi.mock("../forge-service", () => ({
  fetchCreationFee: vi.fn(),
  submitForge: vi.fn(),
}));

vi.mock("../neo-dapi-adapter", () => ({
  invokeForge: vi.fn(),
  WalletRejectedError: class WalletRejectedError extends Error {
    constructor(message = "User rejected the transaction") {
      super(message);
      this.name = "WalletRejectedError";
    }
  },
}));

vi.mock("../forge-config", () => ({
  FACTORY_CONTRACT_HASH: "0xfactory",
  WALLET_STORAGE_KEY: "forge_wallet_type",
  NEOTUBE_BASE_URL: "https://testnet.neotube.io",
}));

function makeFormResult(
  overrides: Partial<UseForgeFormResult> = {}
): UseForgeFormResult {
  return {
    name: "",
    setName: vi.fn(),
    symbol: "",
    setSymbol: vi.fn(),
    supply: "",
    setSupply: vi.fn(),
    decimals: "8",
    setDecimals: vi.fn(),
    imageUrl: "",
    setImageUrl: vi.fn(),
    imagePreview: "idle",
    creatorFee: "0",
    setCreatorFee: vi.fn(),
    errors: {},
    creationFeeDatoshi: 1_500_000_000n,
    creationFeeDisplay: "15",
    feeLoading: false,
    creationCostQuote: {
      factoryFeeDatoshi: 1_500_000_000n,
      estimatedSystemFeeDatoshi: 1_157_121_145n,
      estimatedNetworkFeeDatoshi: 1_275_520n,
      estimatedChainFeeDatoshi: 1_158_396_665n,
      estimatedTotalWalletOutflowDatoshi: 2_658_396_665n,
    },
    creationCostLoading: false,
    creationCostError: null,
    gasCheckResult: {
      sufficient: true,
      actual: 3_000_000_000n,
      required: 2_658_396_665n,
    },
    canSubmit: true,
    submitting: false,
    submittedTxHash: null,
    submitError: null,
    submit: vi.fn(),
    ...overrides,
  };
}

describe("ForgeOverlay", () => {
  beforeEach(() => {
    vi.mocked(useForgeForm).mockReturnValue(makeFormResult());
  });

  it("renders FORGE button", () => {
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /FORGE/i })
    ).toBeInTheDocument();
    expect(screen.getByText("TokenFactory fee")).toBeInTheDocument();
    expect(screen.getByText("Estimated total wallet outflow")).toBeInTheDocument();
  });

  it("FORGE button is disabled when GAS is insufficient", () => {
    vi.mocked(useForgeForm).mockReturnValue(
      makeFormResult({
        gasCheckResult: {
          sufficient: false,
          actual: 500_000_000n,
          required: 2_658_396_665n,
        },
        canSubmit: false,
      })
    );
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={500_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /FORGE/i })).toBeDisabled();
  });

  it("shows the NeoLine breakdown disclaimer from Forge's side", () => {
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={3_000_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );

    expect(
      screen.getByText(/NeoLine confirmation may show only the chain-fee portion/i)
    ).toBeInTheDocument();
    expect(screen.getByText("11.58396665 GAS")).toBeInTheDocument();
    expect(screen.getByText("26.58396665 GAS")).toBeInTheDocument();
  });

  it("shows spinner text when submitting", () => {
    vi.mocked(useForgeForm).mockReturnValue(
      makeFormResult({ submitting: true })
    );
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(screen.getByText(/Forging/i)).toBeInTheDocument();
  });

  it("shows error banner for submitError", () => {
    vi.mocked(useForgeForm).mockReturnValue(
      makeFormResult({
        submitError: "Transaction cancelled. Please try again.",
      })
    );
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    expect(screen.getByText(/Transaction cancelled/i)).toBeInTheDocument();
  });

  it("Escape does NOT close when submitting", () => {
    vi.mocked(useForgeForm).mockReturnValue(
      makeFormResult({ submitting: true })
    );
    const onClose = vi.fn();
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={onClose}
        onTxSubmitted={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape closes when not submitting", () => {
    const onClose = vi.fn();
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={onClose}
        onTxSubmitted={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Crowdfund and Speculative mode options are disabled", () => {
    const { container } = render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={vi.fn()}
      />
    );
    const disabledRadios = container.querySelectorAll(
      'input[type="radio"]:disabled'
    );
    expect(disabledRadios.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Speculative/)).toHaveTextContent(
      "Speculative - launch after creation"
    );
    expect(
      screen.getByText(/Forge creates tokens in Community mode first/i)
    ).toBeInTheDocument();
  });

  it("calls onTxSubmitted when submittedTxHash is set", async () => {
    const onTxSubmitted = vi.fn();
    vi.mocked(useForgeForm).mockReturnValue(
      makeFormResult({ submittedTxHash: "0xdeadbeef" })
    );
    render(
      <ForgeOverlay
        address="NwMe"
        gasBalance={2_000_000_000n}
        onClose={vi.fn()}
        onTxSubmitted={onTxSubmitted}
      />
    );
    await waitFor(() =>
      expect(onTxSubmitted).toHaveBeenCalledWith("0xdeadbeef")
    );
  });
});
