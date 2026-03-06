import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FactoryAdminDashboard, type AdminMutationState } from "./FactoryAdminDashboard";
import type { ClaimableFactoryAsset, FactoryConfig } from "../types";

const config: FactoryConfig = {
  creationFee: 100_000_000n,
  operationFee: 25_000_000n,
  paused: false,
  owner: "0xowner",
  templateScriptHash: "0xtemplate",
  templateVersion: 1n,
  templateNefStored: true,
  templateManifestStored: true,
};

const assets: ClaimableFactoryAsset[] = [
  {
    contractHash: "0xresolved",
    symbol: "GAS",
    name: "GasToken",
    amount: 250_000_000n,
    decimals: 8,
    displayAmount: "2.50000000",
    partialClaimSupported: true,
  },
  {
    contractHash: "0xunknown",
    symbol: "Unknown Asset",
    name: "Unknown Asset",
    amount: 42n,
    decimals: null,
    displayAmount: "42",
    partialClaimSupported: false,
  },
];

function renderDashboard(
  overrides: {
    activeMutationId?: string | null;
    mutations?: Record<string, AdminMutationState | undefined>;
  } = {}
) {
  const onSetCreationFee = vi.fn().mockResolvedValue(undefined);
  const onSetOperationFee = vi.fn().mockResolvedValue(undefined);
  const onSetPaused = vi.fn().mockResolvedValue(undefined);
  const onUpgradeTemplate = vi.fn().mockResolvedValue(undefined);
  const onClaimAll = vi.fn().mockResolvedValue(undefined);
  const onClaim = vi.fn().mockResolvedValue(undefined);

  render(
    <FactoryAdminDashboard
      factoryHash="0xfactory"
      connectedAddress="Nowner"
      ownerDisplay="Nowner"
      config={config}
      assets={assets}
      assetsLoading={false}
      assetsError={null}
      activeMutationId={overrides.activeMutationId ?? null}
      mutations={overrides.mutations ?? {}}
      onRetryAssets={vi.fn()}
      onSetCreationFee={onSetCreationFee}
      onSetOperationFee={onSetOperationFee}
      onSetPaused={onSetPaused}
      onUpgradeTemplate={onUpgradeTemplate}
      onClaimAll={onClaimAll}
      onClaim={onClaim}
    />
  );

  return {
    onSetCreationFee,
    onSetOperationFee,
    onSetPaused,
    onUpgradeTemplate,
    onClaimAll,
    onClaim,
  };
}

describe("FactoryAdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks fee submission when the value matches the current on-chain fee", () => {
    const { onSetCreationFee } = renderDashboard();

    fireEvent.change(screen.getByLabelText("Creation fee GAS input"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set Creation Fee" }));

    expect(onSetCreationFee).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("No change to submit.");
  });

  it("disables partial claim for unresolved assets but keeps claim all available", () => {
    renderDashboard();

    expect(screen.getByLabelText("Partial amount for 0xunknown")).toBeDisabled();
    const claimAllButtons = screen.getAllByRole("button", { name: "Claim All" });
    expect(claimAllButtons[1]).not.toBeDisabled();
    expect(
      screen.getByText("Partial claim is unavailable when asset decimals cannot be resolved.")
    ).toBeInTheDocument();
  });

  it("locks unrelated actions while one mutation is active", () => {
    renderDashboard({ activeMutationId: "creation-fee" });

    expect(screen.getByRole("button", { name: "Set Creation Fee" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Set Operation Fee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause Factory" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upgrade Template" })).toBeDisabled();
  });

  it("shows inline technical details for failed actions", () => {
    renderDashboard({
      mutations: {
        "creation-fee": {
          phase: "error",
          message: "Friendly error",
          txHash: "0xtx",
          technicalDetails: "raw rpc details",
        },
      },
    });

    expect(screen.getByText(/Friendly error/)).toBeInTheDocument();
    expect(screen.getByText("Tx: 0xtx")).toBeInTheDocument();
    expect(screen.getByText("Technical details")).toBeInTheDocument();
  });

  it("blocks template upgrade when the NEF file extension is invalid", async () => {
    const { onUpgradeTemplate } = renderDashboard();

    const nefInput = screen.getByLabelText("Template NEF file") as HTMLInputElement;
    const manifestInput = screen.getByLabelText("Template manifest file") as HTMLInputElement;

    fireEvent.change(nefInput, {
      target: {
        files: [new File(["nef"], "TokenTemplate.txt", { type: "text/plain" })],
      },
    });
    fireEvent.change(manifestInput, {
      target: {
        files: [
          new File(['{"name":"TokenTemplate"}'], "TokenTemplate.manifest.json", {
            type: "application/json",
          }),
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Upgrade Template" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Template NEF file must use the .nef extension."
      )
    );
    expect(onUpgradeTemplate).not.toHaveBeenCalled();
  });

  it("blocks template upgrade when the manifest JSON is invalid", async () => {
    const { onUpgradeTemplate } = renderDashboard();

    const nefInput = screen.getByLabelText("Template NEF file") as HTMLInputElement;
    const manifestInput = screen.getByLabelText("Template manifest file") as HTMLInputElement;

    fireEvent.change(nefInput, {
      target: {
        files: [new File(["nef"], "TokenTemplate.nef", { type: "application/octet-stream" })],
      },
    });
    fireEvent.change(manifestInput, {
      target: {
        files: [new File(['{"broken"'], "TokenTemplate.manifest.json", { type: "application/json" })],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Upgrade Template" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Manifest JSON is invalid.")
    );
    expect(onUpgradeTemplate).not.toHaveBeenCalled();
  });
});
