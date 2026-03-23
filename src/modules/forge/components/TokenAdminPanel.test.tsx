import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TokenAdminPanel } from "./TokenAdminPanel";
import type { TokenInfo } from "../types";

const invokeApplyTokenChanges = vi.fn();
const invokeClaimCreatorFee = vi.fn();
const invokeClaimCreatorFees = vi.fn();
const fetchFactoryConfig = vi.fn();
vi.mock("../neo-dapi-adapter", () => ({
  invokeApplyTokenChanges: (...args: unknown[]) => invokeApplyTokenChanges(...args),
  invokeClaimCreatorFee: (...args: unknown[]) => invokeClaimCreatorFee(...args),
  invokeClaimCreatorFees: (...args: unknown[]) => invokeClaimCreatorFees(...args),
}));
vi.mock("../factory-governance-service", () => ({
  fetchFactoryConfig: (...args: unknown[]) => fetchFactoryConfig(...args),
}));

vi.mock("./AdminTabIdentity", () => ({
  AdminTabIdentity: ({ onStageChange }: { onStageChange?: (change: { id: string; type: "metadata"; label: string; payload: Record<string, string> }) => void }) => (
    <div>
      Identity Content
      <button
        onClick={() =>
          onStageChange?.({
            id: "metadata-0xtoken",
            type: "metadata",
            label: "Update image URL",
            payload: { imageUrl: "https://new.png" },
          })
        }
      >
        Stage Mock
      </button>
    </div>
  ),
}));
vi.mock("./AdminTabSupply", () => ({
  AdminTabSupply: ({ onStageChange }: { onStageChange?: (change: { id: string; type: "mint" | "maxSupply"; label: string; payload: Record<string, string | number> }) => void }) => (
    <div>
      Supply Content
      <button
        onClick={() =>
          onStageChange?.({
            id: "mint-0xtoken",
            type: "mint",
            label: "Mint 10 HUSH to NwRecipient",
            payload: { to: "NwRecipient", amount: 10 },
          })
        }
      >
        Stage Mint Mock
      </button>
      <button
        onClick={() =>
          onStageChange?.({
            id: "maxSupply-0xtoken",
            type: "maxSupply",
            label: "Set max supply to 2000",
            payload: { maxSupply: "2000" },
          })
        }
      >
        Stage Max Supply Mock
      </button>
    </div>
  ),
}));
vi.mock("./AdminTabProperties", () => ({
  AdminTabProperties: ({ onStageChange }: { onStageChange?: (change: { id: string; type: "burnRate"; label: string; payload: Record<string, string | number> }) => void }) => (
    <div>
      Properties Content
      <button
        onClick={() =>
          onStageChange?.({
            id: "burnRate-0xtoken",
            type: "burnRate",
            label: "Set burn rate to 2.00%",
            payload: { basisPoints: 200 },
          })
        }
      >
        Stage Burn Mock
      </button>
    </div>
  ),
}));
vi.mock("./AdminTabDangerZone", () => ({
  AdminTabDangerZone: ({ onStageChange }: { onStageChange?: (change: { id: string; type: "lock"; label: string; payload: Record<string, boolean> }) => void }) => (
    <div>
      Danger Content
      <button
        onClick={() =>
          onStageChange?.({
            id: "lock-0xtoken",
            type: "lock",
            label: "Lock token permanently",
            payload: { symbolConfirmed: true },
          })
        }
      >
        Stage Lock Mock
      </button>
    </div>
  ),
}));

function makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contractHash: "0xtoken",
    symbol: "HUSH",
    name: "Hush",
    creator: "NwCreator",
    supply: 1000n,
    decimals: 0,
    mode: "community",
    tier: 0,
    createdAt: 1,
    claimableCreatorFee: 500_000n,
    ...overrides,
  };
}

describe("TokenAdminPanel", () => {
  beforeEach(() => {
    invokeApplyTokenChanges.mockReset();
    invokeApplyTokenChanges.mockResolvedValue("0xtx");
    invokeClaimCreatorFee.mockReset();
    invokeClaimCreatorFee.mockResolvedValue("0xclaimPartial");
    invokeClaimCreatorFees.mockReset();
    invokeClaimCreatorFees.mockResolvedValue("0xclaimAll");
    fetchFactoryConfig.mockReset();
    fetchFactoryConfig.mockResolvedValue({ operationFee: 50_000_000n });
  });

  it("shows tabs when unlocked", () => {
    render(<TokenAdminPanel token={makeToken({ locked: false })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Properties" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Danger Zone" })).toBeInTheDocument();
  });

  it("shows locked banner when token is locked", () => {
    render(<TokenAdminPanel token={makeToken({ locked: true })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText(/Permanently Immutable/i)).toBeInTheDocument();
    expect(screen.getByText("CREATOR FEE CLAIMS")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("shows claimable creator GAS section for creator-owned tokens", () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.getByText("CREATOR FEE CLAIMS")).toBeInTheDocument();
    expect(screen.getByText("0.005 GAS")).toBeInTheDocument();
  });

  it("shows the current TokenFactory operation fee note for creator claims", async () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(await screen.findByText(/current TokenFactory operation fee/i)).toHaveTextContent(
      "current TokenFactory operation fee (0.5 GAS)"
    );
  });

  it("hides Supply tab when token is not mintable", () => {
    render(<TokenAdminPanel token={makeToken({ mintable: false })} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Supply" })).not.toBeInTheDocument();
  });

  it("switches tabs", () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByText("Properties Content")).toBeInTheDocument();
  });

  it("shows staged changes list after staging from tab", () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Identity" }));
    fireEvent.click(screen.getByText("Stage Mock"));
    expect(screen.getByText("STAGED CHANGES (1)")).toBeInTheDocument();
    expect(screen.getByText("Update image URL")).toBeInTheDocument();
  });

  it("applies selected staged changes in one transaction", async () => {
    const onTxSubmitted = vi.fn();
    render(<TokenAdminPanel token={makeToken({ decimals: 2 })} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.click(screen.getByRole("tab", { name: "Identity" }));
    fireEvent.click(screen.getByText("Stage Mock"));
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    fireEvent.click(screen.getByText("Stage Burn Mock"));

    fireEvent.click(screen.getByRole("button", { name: "Apply Selected" }));

    expect(invokeApplyTokenChanges).toHaveBeenCalledWith(
      "0xfactory",
      "0xtoken",
      expect.objectContaining({
        imageUrl: "https://new.png",
        burnRate: 200,
        creatorFeeRate: -1,
        newMode: "",
        newMaxSupply: -1n,
        mintTo: null,
        mintAmount: 0n,
        lockToken: false,
      })
    );
    await waitFor(() =>
      expect(onTxSubmitted).toHaveBeenCalledWith("0xtx", "Applying 2 staged changes...")
    );
  });

  it("applies all staged changes (including mint and lock) in one transaction", async () => {
    const onTxSubmitted = vi.fn();
    render(<TokenAdminPanel token={makeToken({ decimals: 2 })} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.click(screen.getByRole("tab", { name: "Identity" }));
    fireEvent.click(screen.getByText("Stage Mock"));
    fireEvent.click(screen.getByRole("tab", { name: "Supply" }));
    fireEvent.click(screen.getByText("Stage Mint Mock"));
    fireEvent.click(screen.getByRole("tab", { name: "Danger Zone" }));
    fireEvent.click(screen.getByText("Stage Lock Mock"));

    fireEvent.click(screen.getByRole("button", { name: "Apply All" }));

    expect(invokeApplyTokenChanges).toHaveBeenCalledWith(
      "0xfactory",
      "0xtoken",
      expect.objectContaining({
        imageUrl: "https://new.png",
        mintTo: "NwRecipient",
        mintAmount: 1000n,
        lockToken: true,
      })
    );
    await waitFor(() =>
      expect(onTxSubmitted).toHaveBeenCalledWith("0xtx", "Applying 3 staged changes...")
    );
  });

  it("rejects staged batch when mint and max supply are combined", async () => {
    const onTxSubmitted = vi.fn();
    render(<TokenAdminPanel token={makeToken({ decimals: 2 })} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.click(screen.getByRole("tab", { name: "Supply" }));
    fireEvent.click(screen.getByText("Stage Mint Mock"));
    fireEvent.click(screen.getByText("Stage Max Supply Mock"));
    fireEvent.click(screen.getByRole("button", { name: "Apply All" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot apply Mint and Max Supply in the same staged transaction."
    );
    expect(invokeApplyTokenChanges).not.toHaveBeenCalled();
    expect(onTxSubmitted).not.toHaveBeenCalled();
  });

  it("submits a partial creator-fee claim with parsed GAS amount", async () => {
    const onTxSubmitted = vi.fn();
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.change(screen.getByLabelText("Creator fee claim GAS input"), {
      target: { value: "0.002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Claim Partial" }));

    await waitFor(() =>
      expect(invokeClaimCreatorFee).toHaveBeenCalledWith("0xtoken", 200000n)
    );
    expect(onTxSubmitted).toHaveBeenCalledWith(
      "0xclaimPartial",
      "Claiming creator fees for HUSH..."
    );
    expect(screen.getByText("Creator-fee claim submitted.")).toBeInTheDocument();
  });

  it("rejects partial creator-fee claims above the available balance", async () => {
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Creator fee claim GAS input"), {
      target: { value: "0.006" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Claim Partial" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Amount cannot exceed the current claimable creator fee balance."
    );
    expect(invokeClaimCreatorFee).not.toHaveBeenCalled();
  });

  it("submits a creator-fee claim all action", async () => {
    const onTxSubmitted = vi.fn();
    render(<TokenAdminPanel token={makeToken()} factoryHash="0xfactory" onTxSubmitted={onTxSubmitted} />);

    fireEvent.click(screen.getByRole("button", { name: "Claim All" }));

    await waitFor(() =>
      expect(invokeClaimCreatorFees).toHaveBeenCalledWith("0xtoken")
    );
    expect(onTxSubmitted).toHaveBeenCalledWith(
      "0xclaimAll",
      "Claiming creator fees for HUSH..."
    );
    expect(screen.getByText("Creator-fee claim-all submitted.")).toBeInTheDocument();
  });
});
