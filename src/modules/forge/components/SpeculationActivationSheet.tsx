"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GAS_CONTRACT_HASH, PRIVATE_NET_RPC_URL } from "../forge-config";
import { fetchFactoryConfig } from "../factory-governance-service";
import {
  deriveLaunchProfilePreview,
  getLaunchProfileDefinition,
  getRecommendedLaunchProfiles,
  listLaunchProfiles,
} from "../market-launch-profiles";
import {
  formatMarketPrice,
  formatQuoteAmount,
} from "../market-formatting";
import { getTokenBalance } from "../neo-rpc-client";
import {
  ensureDevnetSpeculationBootstrap,
  invokeChangeMode,
} from "../neo-dapi-adapter";
import { quoteChangeModeCost } from "../token-admin-cost-service";
import {
  formatDatoshiAsGas,
  formatTokenAmount,
  parseTokenAmountInput,
} from "../token-economics-logic";
import { useWalletStore } from "../wallet-store";
import { toUiErrorMessage } from "./error-utils";
import type {
  LaunchProfileId,
  PendingTxSubmissionOptions,
  TokenInfo,
} from "../types";

interface Props {
  open?: boolean;
  token: TokenInfo;
  factoryHash: string;
  onClose?: () => void;
  onTxSubmitted: (
    txHash: string,
    message: string,
    options?: PendingTxSubmissionOptions
  ) => void;
  layout?: "modal" | "page";
  backHref?: string;
  pendingMessage?: string | null;
  pendingTitle?: string;
}

type CurveInventoryMode = "all" | "partial";

function formatReviewGasValue(datoshi: bigint | number): string {
  const formatted = formatDatoshiAsGas(datoshi);
  const [amount, unit] = formatted.split(" ");

  if (!amount || !unit || !amount.includes(".")) {
    return formatted;
  }

  const [whole, fraction] = amount.split(".");
  const shortenedFraction = fraction.slice(0, 4).replace(/0+$/, "");

  return shortenedFraction ? `${whole}.${shortenedFraction} ${unit}` : `${whole} ${unit}`;
}

export function SpeculationActivationSheet({
  open,
  token,
  factoryHash,
  onClose,
  onTxSubmitted,
  layout = "modal",
  backHref,
  pendingMessage = null,
  pendingTitle = "Launching speculation market",
}: Props) {
  const isVisible = open ?? true;
  const address = useWalletStore((state) => state.address);
  const balances = useWalletStore((state) => state.balances);
  const isLocalDevnet = PRIVATE_NET_RPC_URL === "/api/rpc";
  const gasBalance = useMemo(
    () =>
      balances.find((entry) => entry.contractHash === GAS_CONTRACT_HASH)?.amount ?? 0n,
    [balances]
  );

  const [quoteAsset, setQuoteAsset] = useState<"GAS" | "NEO">("GAS");
  const recommendedProfiles = useMemo(
    () => getRecommendedLaunchProfiles(token.supply),
    [token.supply]
  );
  const defaultLaunchProfile = recommendedProfiles[0] ?? "starter";
  const [launchProfile, setLaunchProfile] = useState<LaunchProfileId>(defaultLaunchProfile);
  const [curveMode, setCurveMode] = useState<CurveInventoryMode>("all");
  const [partialInput, setPartialInput] = useState("");
  const [ownerBalance, setOwnerBalance] = useState<bigint | null>(null);
  const [ownerBalanceLoading, setOwnerBalanceLoading] = useState(false);
  const [ownerBalanceError, setOwnerBalanceError] = useState<string | null>(null);
  const [operationFee, setOperationFee] = useState<bigint | null>(null);
  const [operationFeeLoading, setOperationFeeLoading] = useState(false);
  const [operationFeeError, setOperationFeeError] = useState<string | null>(null);
  const [costQuote, setCostQuote] = useState<Awaited<
    ReturnType<typeof quoteChangeModeCost>
  > | null>(null);
  const [costQuoteLoading, setCostQuoteLoading] = useState(false);
  const [costQuoteError, setCostQuoteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapAttempted, setBootstrapAttempted] = useState(false);

  useEffect(() => {
    if (!isVisible) return;
    setQuoteAsset("GAS");
    setLaunchProfile(defaultLaunchProfile);
    setCurveMode("all");
    setPartialInput("");
    setSubmitError(null);
    setBootstrapAttempted(false);
  }, [defaultLaunchProfile, factoryHash, isVisible, token.contractHash]);

  useEffect(() => {
    if (!isVisible || !factoryHash) return;

    let cancelled = false;
    setOperationFeeLoading(true);
    setOperationFeeError(null);

    fetchFactoryConfig(factoryHash)
      .then((config) => {
        if (cancelled) return;
        setOperationFee(config.operationFee);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOperationFee(null);
        setOperationFeeError(
          error instanceof Error ? error.message : "Unable to load TokenFactory update fee."
        );
      })
      .finally(() => {
        if (!cancelled) setOperationFeeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [factoryHash, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    if (!address) {
      setOwnerBalance(null);
      setOwnerBalanceLoading(false);
      setOwnerBalanceError("Connect the owner wallet to review launch inventory.");
      return;
    }

    let cancelled = false;
    setOwnerBalanceLoading(true);
    setOwnerBalanceError(null);

    getTokenBalance(token.contractHash, address)
      .then((balance) => {
        if (cancelled) return;
        setOwnerBalance(balance);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOwnerBalance(null);
        setOwnerBalanceError(
          error instanceof Error ? error.message : "Unable to load owner token balance."
        );
      })
      .finally(() => {
        if (!cancelled) setOwnerBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, isVisible, token.contractHash]);

  const partialValue =
    curveMode === "partial"
      ? parseTokenAmountInput(partialInput, token.decimals)
      : null;

  const selectedCurveInventory = useMemo(() => {
    if (ownerBalance === null) return null;
    if (curveMode === "all") return ownerBalance;
    return partialValue;
  }, [curveMode, ownerBalance, partialValue]);

  const validationMessage = useMemo(() => {
    if (!factoryHash) return "Factory hash is not configured.";
    if (!address) return "Connect the owner wallet to review launch inventory.";
    if (ownerBalanceLoading) return "Loading owner inventory...";
    if (ownerBalanceError) return ownerBalanceError;
    if (ownerBalance === null) return "Owner inventory is not available yet.";
    if (ownerBalance <= 0n) return "Owner inventory must be positive to activate speculation.";
    if (curveMode === "partial" && partialInput.trim() === "") {
      return "Enter a curve inventory amount.";
    }
    if (curveMode === "partial" && partialValue === null) {
      return `Enter a valid ${token.symbol} amount with up to ${token.decimals} decimals.`;
    }
    if (selectedCurveInventory === null || selectedCurveInventory <= 0n) {
      return "Curve inventory must be positive.";
    }
    if (selectedCurveInventory > ownerBalance) {
      return "Curve inventory cannot exceed the current owner balance.";
    }
    return null;
  }, [
    address,
    curveMode,
    factoryHash,
    ownerBalance,
    ownerBalanceError,
    ownerBalanceLoading,
    partialInput,
    partialValue,
    selectedCurveInventory,
    token.decimals,
    token.symbol,
  ]);

  const retainedInventory =
    ownerBalance !== null && selectedCurveInventory !== null
      ? ownerBalance - selectedCurveInventory
      : null;
  const launchPreview = useMemo(
    () =>
      selectedCurveInventory !== null
        ? deriveLaunchProfilePreview(launchProfile, quoteAsset, selectedCurveInventory)
        : null,
    [launchProfile, quoteAsset, selectedCurveInventory]
  );
  const modeParams = useMemo(
    () =>
      validationMessage === null && selectedCurveInventory !== null
        ? [quoteAsset, selectedCurveInventory.toString(), launchProfile]
        : [],
    [launchProfile, quoteAsset, selectedCurveInventory, validationMessage]
  );

  useEffect(() => {
    if (!isVisible || !address || operationFee === null || validationMessage !== null) {
      setCostQuote(null);
      setCostQuoteError(null);
      setCostQuoteLoading(false);
      return;
    }

    let cancelled = false;
    setCostQuoteLoading(true);
    setCostQuoteError(null);

    quoteChangeModeCost(
      address,
      factoryHash,
      token.contractHash,
      "speculation",
      modeParams,
      operationFee
    )
      .then((quote) => {
        if (!cancelled) setCostQuote(quote);
      })
      .catch(async (error: unknown) => {
        if (cancelled) return;

        const message =
          error instanceof Error
            ? error.message
            : "Unable to estimate the launch transaction cost.";

        if (
          isLocalDevnet &&
          !bootstrapAttempted &&
          /BondingCurveRouter not configured/i.test(message)
        ) {
          setBootstrapAttempted(true);

          try {
            await ensureDevnetSpeculationBootstrap(factoryHash);
            if (cancelled) return;

            const repairedQuote = await quoteChangeModeCost(
              address,
              factoryHash,
              token.contractHash,
              "speculation",
              modeParams,
              operationFee
            );
            if (cancelled) return;

            setCostQuote(repairedQuote);
            setCostQuoteError(null);
            return;
          } catch (bootstrapError) {
            if (cancelled) return;
            setCostQuote(null);
            setCostQuoteError(toUiErrorMessage(bootstrapError));
            return;
          }
        }

        setCostQuote(null);
        setCostQuoteError(message);
      })
      .finally(() => {
        if (!cancelled) setCostQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    address,
    bootstrapAttempted,
    factoryHash,
    isVisible,
    isLocalDevnet,
    modeParams,
    operationFee,
    token.contractHash,
    validationMessage,
  ]);

  if (!isVisible) return null;

  const isPageLayout = layout === "page";
  const resolvedBackHref = backHref ?? `/tokens/${token.contractHash}`;
  const handleDismiss = onClose ?? (() => {});
  const interactionLocked = submitting || pendingMessage !== null;

  const gasInsufficient =
    costQuote !== null && gasBalance < costQuote.estimatedTotalWalletOutflowDatoshi;
  const disableSubmit =
    interactionLocked ||
    validationMessage !== null ||
    operationFeeLoading ||
    operationFee === null ||
    costQuoteLoading ||
    costQuote === null ||
    costQuoteError !== null ||
    gasInsufficient;

  async function handleSubmit() {
    if (disableSubmit || selectedCurveInventory === null || retainedInventory === null) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const txHash = await invokeChangeMode(
        factoryHash,
        token.contractHash,
        "speculation",
        modeParams
      );

      onTxSubmitted(txHash, `Launching ${token.symbol} speculation market...`, {
        targetTokenHash: token.contractHash,
        redirectPath: `/markets/${token.contractHash}`,
        marketLaunchSummary: {
          tokenHash: token.contractHash,
          pairLabel: `${token.symbol}/${quoteAsset}`,
          quoteAsset,
          launchProfile,
          tokenSymbol: token.symbol,
          curveInventoryRaw: selectedCurveInventory.toString(),
          retainedInventoryRaw: retainedInventory.toString(),
        },
      });
      handleDismiss();
    } catch (error) {
      setSubmitError(toUiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const panel = (
    <section
      role={isPageLayout ? undefined : "dialog"}
      aria-modal={isPageLayout ? undefined : true}
      aria-label="Speculation activation review"
      className="relative w-full rounded-[28px] p-5 sm:p-6"
      aria-busy={interactionLocked}
      style={{
        background: "var(--forge-bg-card)",
        border: "1px solid var(--forge-border-medium)",
      }}
      onClick={isPageLayout ? undefined : (event) => event.stopPropagation()}
    >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p
              className="text-xs font-semibold uppercase tracking-[0.24em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Token Admin
            </p>
            <h2
              className="text-2xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              Launch speculation market
            </h2>
            <p className="text-sm" style={{ color: "var(--forge-text-secondary)" }}>
              Review the canonical pair, curve inventory, and wallet outflow before signature.
            </p>
          </div>

          {!isPageLayout ? (
            <button
              type="button"
              aria-label="Close speculation activation review"
              onClick={handleDismiss}
              disabled={interactionLocked}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                border: "1px solid var(--forge-border-subtle)",
                color: "var(--forge-text-muted)",
              }}
            >
              Close
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-5">
            <section
              className="rounded-[24px] p-5"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase" style={{ color: "var(--forge-text-muted)" }}>
                    Quote Asset
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(["GAS", "NEO"] as const).map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => setQuoteAsset(asset)}
                        disabled={interactionLocked}
                        className="rounded-full px-4 py-2 text-sm font-semibold"
                        style={{
                          background:
                            quoteAsset === asset
                              ? "rgba(255,107,53,0.18)"
                              : "rgba(255,255,255,0.04)",
                          color:
                            quoteAsset === asset
                              ? "var(--forge-color-primary)"
                              : "var(--forge-text-primary)",
                          border: "1px solid var(--forge-border-subtle)",
                        }}
                      >
                        {asset}
                        {asset === "GAS" ? " default" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p
                      className="text-xs font-semibold uppercase"
                      style={{ color: "var(--forge-text-muted)" }}
                    >
                      Launch Profile
                    </p>
                    <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
                      Recommended now:{" "}
                      {recommendedProfiles
                        .map((profile) => getLaunchProfileDefinition(profile).label)
                        .join(" / ")}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {listLaunchProfiles().map((profile) => {
                      const targets = profile.targets[quoteAsset];
                      const active = profile.id === launchProfile;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => setLaunchProfile(profile.id)}
                          disabled={interactionLocked}
                          className="rounded-2xl px-4 py-3 text-left transition hover:opacity-95"
                          style={{
                            background: active
                              ? "rgba(255,107,53,0.14)"
                              : "rgba(255,255,255,0.03)",
                            border: `1px solid ${
                              active
                                ? "rgba(255,107,53,0.28)"
                                : "var(--forge-border-subtle)"
                            }`,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className="text-sm font-semibold"
                              style={{ color: "var(--forge-text-primary)" }}
                            >
                              {profile.label}
                            </span>
                            {recommendedProfiles.includes(profile.id) && (
                              <span
                                className="rounded-full px-2 py-1 text-[11px] font-semibold"
                                style={{
                                  background: "rgba(32,201,151,0.14)",
                                  color: "#20c997",
                                }}
                              >
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
                            {profile.description}
                          </p>
                          <div
                            className="mt-3 flex flex-wrap gap-2 text-[11px]"
                            style={{ color: "var(--forge-text-secondary)" }}
                          >
                            <span>{formatQuoteAmount(targets.initialLaunchCap, quoteAsset)} launch cap</span>
                            <span>{formatQuoteAmount(targets.graduationThreshold, quoteAsset)} to graduate</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase" style={{ color: "var(--forge-text-muted)" }}>
                    Curve Inventory
                  </p>
                  <div className="space-y-2">
                    <label
                      className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                      style={{
                        background:
                          curveMode === "all" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                        borderColor:
                          curveMode === "all"
                            ? "rgba(255,255,255,0.1)"
                            : "var(--forge-border-subtle)",
                      }}
                    >
                      <input
                        type="radio"
                        name="curveInventoryMode"
                        checked={curveMode === "all"}
                        onChange={() => setCurveMode("all")}
                        disabled={interactionLocked}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
                          All owner inventory
                        </span>
                        <span className="block text-xs" style={{ color: "var(--forge-text-muted)" }}>
                          Commit the full connected-wallet balance to the curve.
                        </span>
                      </span>
                    </label>

                    <label
                      className="block rounded-2xl border px-4 py-3"
                      style={{
                        background:
                          curveMode === "partial" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                        borderColor:
                          curveMode === "partial"
                            ? "rgba(255,255,255,0.1)"
                            : "var(--forge-border-subtle)",
                      }}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="curveInventoryMode"
                          checked={curveMode === "partial"}
                          onChange={() => setCurveMode("partial")}
                          disabled={interactionLocked}
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
                            Partial amount
                          </span>
                          <span className="block text-xs" style={{ color: "var(--forge-text-muted)" }}>
                            Keep the remaining inventory in the owner wallet.
                          </span>
                        </span>
                      </span>

                      {curveMode === "partial" && (
                        <div className="mt-3">
                          <input
                            aria-label="Curve inventory input"
                            value={partialInput}
                            onChange={(event) => setPartialInput(event.target.value)}
                            placeholder={`${token.symbol} amount`}
                            disabled={interactionLocked}
                            className="w-full rounded-2xl px-4 py-3 text-sm"
                            style={{
                              background: "var(--forge-bg-primary)",
                              border: "1px solid var(--forge-border-medium)",
                              color: "var(--forge-text-primary)",
                            }}
                          />
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <p className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>
                    Owner inventory
                  </p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
                    {ownerBalanceLoading
                      ? "Loading..."
                      : ownerBalance !== null
                        ? `${formatTokenAmount(ownerBalance, token.decimals)} ${token.symbol}`
                        : "Unavailable"}
                  </p>
                </div>

                <div
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: "rgba(255,176,32,0.08)",
                    border: "1px solid rgba(255,176,32,0.16)",
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
                    Rules
                  </p>
                  <ul className="mt-2 space-y-2 text-xs leading-relaxed" style={{ color: "var(--forge-text-secondary)" }}>
                    <li>Trading starts on BondingCurveRouter and the pair becomes public at {`/markets/${token.contractHash}`}.</li>
                    <li>The selected launch profile fixes the initial public curve shape and graduation target at activation time.</li>
                    <li>The selected quote asset is canonical for this market and cannot be changed from the pair page.</li>
                    <li>Retained owner inventory follows the same public market rules as any other holder inventory.</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section
              className="rounded-[24px] p-5"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-xs font-semibold uppercase" style={{ color: "var(--forge-text-muted)" }}>
                Launch Preview
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PreviewStat label="Canonical pair" value={`${token.symbol}/${quoteAsset}`} />
                <PreviewStat
                  label="Launch profile"
                  value={getLaunchProfileDefinition(launchProfile).label}
                />
                <PreviewStat
                  label="Curve inventory"
                  value={
                    selectedCurveInventory !== null
                      ? `${formatTokenAmount(selectedCurveInventory, token.decimals)} ${token.symbol}`
                      : "-"
                  }
                />
                <PreviewStat
                  label="Retained inventory"
                  value={
                    retainedInventory !== null
                      ? `${formatTokenAmount(retainedInventory, token.decimals)} ${token.symbol}`
                      : "-"
                  }
                />
                <PreviewStat
                  label="Total supply"
                  value={`${formatTokenAmount(token.supply, token.decimals)} ${token.symbol}`}
                />
                <PreviewStat
                  label="Public launch cap"
                  value={
                    launchPreview !== null
                      ? formatQuoteAmount(launchPreview.initialLaunchCap, quoteAsset)
                      : "-"
                  }
                />
                <PreviewStat
                  label="Target to graduate"
                  value={
                    launchPreview !== null
                      ? formatQuoteAmount(launchPreview.graduationThreshold, quoteAsset)
                      : "-"
                  }
                />
                    <PreviewStat
                      label="Initial price"
                      value={
                        launchPreview !== null
                          ? formatMarketPrice(
                              launchPreview.initialPrice,
                              quoteAsset,
                              token.decimals
                            )
                      : "-"
                  }
                />
                <PreviewStat
                  label="Curve sold by graduation"
                  value={
                    launchPreview !== null
                      ? `${(launchPreview.soldAtGraduationBps / 100).toFixed(2)}%`
                      : "-"
                  }
                />
              </div>
            </section>

            <section
              className="rounded-[24px] p-5"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-xs font-semibold uppercase" style={{ color: "var(--forge-text-muted)" }}>
                Wallet Cost Review
              </p>

              <div className="mt-4 space-y-2 text-sm">
                <CostRow
                  label="TokenFactory update fee"
                  value={
                    operationFeeLoading
                      ? "Loading..."
                      : operationFee !== null
                        ? formatReviewGasValue(operationFee)
                        : "Unavailable"
                  }
                />
                <CostRow
                  label="Estimated chain fee"
                  value={
                    costQuoteLoading
                      ? "Calculating..."
                      : costQuote !== null
                        ? formatReviewGasValue(costQuote.estimatedChainFeeDatoshi)
                        : "Fill valid launch inputs"
                  }
                />
                <CostRow
                  label="Estimated total wallet outflow"
                  value={
                    costQuoteLoading
                      ? "Calculating..."
                      : costQuote !== null
                        ? formatReviewGasValue(costQuote.estimatedTotalWalletOutflowDatoshi)
                        : "Fill valid launch inputs"
                  }
                />
                <CostRow
                  label="Your GAS balance"
                  value={formatReviewGasValue(gasBalance)}
                  tone={
                    gasInsufficient ? "error" : costQuote !== null ? "success" : "muted"
                  }
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
                NeoLine confirmation may show only the chain-fee portion or a different breakdown.
                This estimate includes both the TokenFactory update fee and the expected chain fee
                for this one transaction.
              </p>

              {operationFeeError && (
                <p className="mt-2 text-xs" style={{ color: "var(--forge-error)" }}>
                  {operationFeeError}
                </p>
              )}
              {costQuoteError && (
                <p className="mt-2 text-xs" style={{ color: "var(--forge-error)" }}>
                  {costQuoteError}
                </p>
              )}
            </section>
          </div>
        </div>

        {(validationMessage || gasInsufficient || submitError) && (
          <div
            role="alert"
            className="mt-5 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: "rgba(255,82,82,0.08)",
              border: "1px solid rgba(255,82,82,0.2)",
              color: "var(--forge-error)",
            }}
          >
            {validationMessage ??
              (gasInsufficient
                ? `Insufficient GAS. Need at least ${formatReviewGasValue(
                    costQuote?.estimatedTotalWalletOutflowDatoshi ?? 0n
                  )} before requesting the signature.`
                : submitError)}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {isPageLayout ? (
            interactionLocked ? (
              <span
                className="rounded-full px-5 py-3 text-center text-sm font-semibold opacity-50"
                style={{
                  border: "1px solid var(--forge-border-medium)",
                  color: "var(--forge-text-primary)",
                }}
              >
                Cancel
              </span>
            ) : (
              <Link
                href={resolvedBackHref}
                className="rounded-full px-5 py-3 text-center text-sm font-semibold"
                style={{
                  border: "1px solid var(--forge-border-medium)",
                  color: "var(--forge-text-primary)",
                }}
              >
                Cancel
              </Link>
            )
          ) : (
            <button
              type="button"
              onClick={handleDismiss}
              disabled={interactionLocked}
              className="rounded-full px-5 py-3 text-sm font-semibold"
              style={{
                border: "1px solid var(--forge-border-medium)",
                color: "var(--forge-text-primary)",
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={disableSubmit}
            className="rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
              color: "var(--forge-text-primary)",
            }}
          >
            {submitting ? "Submitting..." : "Activate Speculation Market"}
          </button>
        </div>
        {pendingMessage && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-[28px] px-6 text-center"
            style={{
              background: "rgba(12, 18, 31, 0.82)",
              backdropFilter: "blur(2px)",
            }}
          >
            <div
              className="max-w-md rounded-[24px] px-6 py-5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--forge-border-medium)",
              }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-[0.24em]"
                style={{ color: "var(--forge-color-primary)" }}
              >
                Transaction Pending
              </p>
              <h3
                className="mt-3 text-xl font-semibold"
                style={{ color: "var(--forge-text-primary)" }}
              >
                {pendingTitle}
              </h3>
              <p
                className="mt-3 text-sm leading-relaxed"
                style={{ color: "var(--forge-text-muted)" }}
              >
                {pendingMessage}
              </p>
            </div>
          </div>
        )}
    </section>
  );

  if (isPageLayout) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {interactionLocked ? (
          <span className="text-sm opacity-60" style={{ color: "var(--forge-text-muted)" }}>
            Back to Token
          </span>
        ) : (
          <Link
            href={resolvedBackHref}
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Back to Token
          </Link>
        )}
        {panel}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.62)" }}
      onClick={handleDismiss}
    >
      <div className="w-full max-w-5xl">{panel}</div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <p className="text-xs uppercase" style={{ color: "var(--forge-text-muted)" }}>
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function CostRow({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: string;
  tone?: "primary" | "success" | "error" | "muted";
}) {
  const color =
    tone === "success"
      ? "var(--forge-success)"
      : tone === "error"
        ? "var(--forge-error)"
        : tone === "muted"
          ? "var(--forge-text-muted)"
          : "var(--forge-text-primary)";

  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: "var(--forge-text-muted)" }}>{label}</span>
      <span className="font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
