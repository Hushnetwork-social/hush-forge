"use client";

import { useEffect, useState } from "react";
import {
  formatMarketPrice,
  formatQuoteAmount,
  formatQuoteAmountRounded,
  formatTokenDisplay,
  formatTokenDisplayRounded,
} from "../market-formatting";
import { formatDatoshiAsGas } from "../token-economics-logic";
import type { MarketPairReadModel } from "../types";
import {
  useMarketTradeFlow,
} from "../use-market-trade-flow";
import type { ConnectionStatus } from "../wallet-store";
import { TradeFailureSheet } from "./TradeFailureSheet";

interface Props {
  pair: MarketPairReadModel;
  connectedAddress: string | null;
  connectionStatus: ConnectionStatus;
  gasBalance: bigint;
  onConnectClick: () => void;
  onTxSubmitted: (txHash: string, message: string) => void;
}

function RailButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 rounded-full px-4 py-2 text-sm font-semibold transition"
      style={{
        background: active ? "rgba(255,107,53,0.14)" : "rgba(255,255,255,0.04)",
        color: active ? "var(--forge-color-primary)" : "var(--forge-text-muted)",
      }}
    >
      {label}
    </button>
  );
}

function PresetChip({
  active = false,
  label,
  onClick,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
      style={{
        background: active
          ? "linear-gradient(135deg, rgba(255, 123, 61, 0.2), rgba(255, 92, 42, 0.32))"
          : "rgba(255,255,255,0.05)",
        color: active ? "var(--forge-text-primary)" : "var(--forge-text-muted)",
        border: active ? "1px solid rgba(255, 123, 61, 0.3)" : "1px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

const SLIPPAGE_PRESET_OPTIONS = ["1", "3", "5"] as const;

type SlippageMode = (typeof SLIPPAGE_PRESET_OPTIONS)[number] | "custom";

function resolveSlippageMode(value: string): SlippageMode {
  const trimmed = value.trim();
  return SLIPPAGE_PRESET_OPTIONS.includes(trimmed as (typeof SLIPPAGE_PRESET_OPTIONS)[number])
    ? (trimmed as (typeof SLIPPAGE_PRESET_OPTIONS)[number])
    : "custom";
}

function formatSlippageSummary(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? `${trimmed}%` : "Custom";
}

function PreviewRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
        {label}
      </span>
      <span
        className="text-sm text-right"
        style={{
          color: emphasis ? "var(--forge-text-primary)" : "var(--forge-text-muted)",
          fontWeight: emphasis ? 600 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function TradeRail({
  pair,
  connectedAddress,
  connectionStatus,
  gasBalance,
  onConnectClick,
  onTxSubmitted,
}: Props) {
  const {
    side,
    setSide,
    amountInput,
    setAmountInput,
    slippageInput,
    setSlippageInput,
    buyPresets,
    sellPresets,
    applyBuyPreset,
    applySellPreset,
    quote,
    quoteLoading,
    quoteError,
    previewStale,
    quoteBalance,
    tokenBalance,
    balancesLoading,
    validationError,
    canSubmit,
    submitting,
    submittedTxHash,
    completeSubmission,
    failure,
    dismissFailure,
    minimumOutput,
    requiredGasFee,
    priceImpactLabel,
    requiresImpactAcknowledgement,
    impactAcknowledged,
    setImpactAcknowledged,
    submit,
  } = useMarketTradeFlow(pair, connectedAddress, gasBalance);
  const [advancedOpen, setAdvancedOpen] = useState(() => resolveSlippageMode(slippageInput) === "custom");
  const [slippageMode, setSlippageMode] = useState<SlippageMode>(() =>
    resolveSlippageMode(slippageInput)
  );

  useEffect(() => {
    if (!submittedTxHash) return;

    onTxSubmitted(
      submittedTxHash,
      `Waiting for ${pair.pairLabel} ${side} confirmation...`
    );
    completeSubmission();
  }, [completeSubmission, onTxSubmitted, pair.pairLabel, side, submittedTxHash]);

  const isBuy = side === "buy";
  const effectiveValidationError =
    validationError ?? (quoteLoading || previewStale ? "Refreshing trade preview..." : null);
  const callToActionLabel =
    connectedAddress === null
      ? connectionStatus === "connecting"
        ? "Connecting wallet..."
        : "Connect wallet to trade"
      : submitting
        ? isBuy
          ? `Buying ${pair.token.symbol}...`
          : `Selling ${pair.token.symbol}...`
        : isBuy
          ? `Buy ${pair.token.symbol}`
          : `Sell ${pair.token.symbol}`;

  const disableCta =
    connectionStatus === "connecting" ||
    (connectedAddress !== null && !canSubmit);
  const currentSlippageSummary = formatSlippageSummary(slippageInput);

  const handlePresetSlippageSelect = (preset: (typeof SLIPPAGE_PRESET_OPTIONS)[number]) => {
    setSlippageMode(preset);
    setSlippageInput(preset);
  };

  const handleCustomSlippageSelect = () => {
    setSlippageMode("custom");
    setAdvancedOpen(true);
  };

  return (
    <>
      <section
        className="rounded-[28px] p-6 xl:sticky xl:top-6"
        style={{
          background:
            "linear-gradient(180deg, rgba(16, 24, 40, 0.96), rgba(10, 15, 28, 0.9))",
          border: "1px solid var(--forge-border-subtle)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-xs uppercase tracking-[0.24em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Trade Rail
            </p>
            <h2
              className="mt-2 whitespace-nowrap text-2xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              Buy / Sell
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-expanded={advancedOpen}
              aria-controls="trade-advanced-settings"
              aria-label={`Advanced settings. Current slippage ${currentSlippageSummary}`}
              onClick={() => setAdvancedOpen((current) => !current)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition hover:opacity-90"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: advancedOpen
                  ? "1px solid rgba(255, 123, 61, 0.32)"
                  : "1px solid transparent",
                color: "var(--forge-text-muted)",
              }}
            >
              Advanced · {currentSlippageSummary}
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <RailButton active={isBuy} label="Buy" onClick={() => setSide("buy")} />
          <RailButton active={!isBuy} label="Sell" onClick={() => setSide("sell")} />
        </div>

        <div className="mt-5 grid gap-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="trade-amount"
                className="text-sm font-medium"
                style={{ color: "var(--forge-text-muted)" }}
              >
                {isBuy ? `Quote in (${pair.quoteAsset})` : `Token in (${pair.token.symbol})`}
              </label>
              <span className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
                {isBuy
                  ? `Balance: ${
                      quoteBalance === null
                        ? connectedAddress
                          ? "Refreshing..."
                          : "-"
                        : formatQuoteAmountRounded(quoteBalance, pair.quoteAsset, 2)
                    }`
                  : `Balance: ${
                      tokenBalance === null
                        ? connectedAddress
                          ? "Refreshing..."
                          : "-"
                        : formatTokenDisplay(tokenBalance, pair.token.decimals, pair.token.symbol)
                    }`}
              </span>
            </div>
            <input
              id="trade-amount"
              type="text"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder={isBuy ? `0 ${pair.quoteAsset}` : `0 ${pair.token.symbol}`}
              className="mt-2 w-full rounded-[18px] px-4 py-3 text-sm"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  effectiveValidationError ? "rgba(255,82,82,0.38)" : "var(--forge-border-subtle)"
                }`,
                color: "var(--forge-text-primary)",
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {isBuy
              ? buyPresets.map((preset) => (
                  <PresetChip
                    key={preset}
                    label={`${preset} ${pair.quoteAsset}`}
                    onClick={() => applyBuyPreset(preset)}
                  />
                ))
              : sellPresets.map((preset) => (
                  <PresetChip
                    key={preset}
                    label={`${preset}%`}
                    onClick={() => applySellPreset(preset)}
                  />
                ))}
          </div>
        </div>

        {advancedOpen && (
          <div
            id="trade-advanced-settings"
            className="mt-4 rounded-[22px] p-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--forge-border-subtle)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p
                  className="text-xs uppercase tracking-[0.24em]"
                  style={{ color: "var(--forge-text-muted)" }}
                >
                  Advanced
                </p>
                <p className="mt-2 text-sm" style={{ color: "var(--forge-text-muted)" }}>
                  Slippage protection between quote preview and wallet signature.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="text-xs font-semibold transition hover:opacity-90"
                style={{ color: "var(--forge-text-muted)" }}
              >
                Hide
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SLIPPAGE_PRESET_OPTIONS.map((preset) => (
                <PresetChip
                  key={preset}
                  active={slippageMode === preset}
                  label={`${preset}%`}
                  onClick={() => handlePresetSlippageSelect(preset)}
                />
              ))}
              <PresetChip
                active={slippageMode === "custom"}
                label="Custom"
                onClick={handleCustomSlippageSelect}
              />
            </div>

            {slippageMode === "custom" && (
              <div className="mt-4">
                <label
                  htmlFor="trade-slippage"
                  className="text-sm font-medium"
                  style={{ color: "var(--forge-text-muted)" }}
                >
                  Custom slippage
                </label>
                <div
                  className="mt-2 flex items-center rounded-[18px] px-4 py-3"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--forge-border-subtle)",
                  }}
                >
                  <input
                    id="trade-slippage"
                    type="text"
                    value={slippageInput}
                    onChange={(event) => setSlippageInput(event.target.value)}
                    placeholder="1"
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: "var(--forge-text-primary)" }}
                  />
                  <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
                    %
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {quoteError && (
          <div
            role="alert"
            className="mt-4 rounded-[18px] px-4 py-3 text-sm"
            style={{
              background: "rgba(255,82,82,0.1)",
              color: "var(--forge-error)",
            }}
          >
            {quoteError}
          </div>
        )}

        {balancesLoading && connectedAddress && (
          <div
            className="mt-4 rounded-[18px] px-4 py-3 text-sm"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "var(--forge-text-muted)",
            }}
          >
            Refreshing wallet balances...
          </div>
        )}

        {effectiveValidationError &&
          !quoteError &&
          !(connectedAddress === null && !amountInput.trim()) && (
            <div
              role="alert"
              className="mt-4 rounded-[18px] px-4 py-3 text-sm"
              style={{
                background: "rgba(255,82,82,0.1)",
                color: "var(--forge-error)",
              }}
            >
              {effectiveValidationError}
            </div>
          )}

          {quote && (
            <>
              {(isBuy && "capped" in quote && quote.capped) && (
                <div
                  className="mt-4 rounded-[18px] px-4 py-3 text-sm"
                  style={{
                    background: "rgba(255, 193, 7, 0.12)",
                    color: "#ffd166",
                  }}
                >
                  {quote.quoteRefund > 0n
                    ? `This buy is capped by the remaining curve inventory. Excess ${pair.quoteAsset} will be refunded after execution.`
                    : "This buy exactly fills the remaining curve inventory."}
                </div>
              )}

            {requiresImpactAcknowledgement && (
              <div
                className="mt-4 rounded-[18px] px-4 py-3 text-sm"
                style={{
                  background: "rgba(255,82,82,0.1)",
                  color: "var(--forge-error)",
                }}
              >
                <p>
                  Price impact is currently {priceImpactLabel}.
                  {" "}This trade needs explicit acknowledgement before signature.
                </p>
                <label className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={impactAcknowledged}
                    onChange={(event) => setImpactAcknowledged(event.target.checked)}
                  />
                  <span>I understand this trade has more than 15% price impact.</span>
                </label>
              </div>
            )}
          </>
        )}

        <div
          className="mt-5 rounded-[22px] p-4"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <PreviewRow
            label={isBuy ? "Expected out" : "Expected quote out"}
            value={
              quote === null
                ? "-"
                : isBuy && "netTokenOut" in quote
                  ? formatTokenDisplayRounded(
                      quote.netTokenOut,
                      pair.token.decimals,
                      pair.token.symbol
                    )
                  : !isBuy && "netQuoteOut" in quote
                    ? formatQuoteAmount(quote.netQuoteOut, pair.quoteAsset)
                    : "-"
            }
            emphasis
          />
          <PreviewRow
            label={isBuy ? "Minimum received" : "Minimum quote out"}
            value={
              minimumOutput === null
                ? "-"
                : isBuy
                  ? formatTokenDisplayRounded(
                      minimumOutput,
                      pair.token.decimals,
                      pair.token.symbol
                    )
                  : formatQuoteAmount(minimumOutput, pair.quoteAsset)
            }
          />
          <PreviewRow label="Price impact" value={priceImpactLabel} />
          {isBuy && quote !== null && "quoteConsumed" in quote && (
            <>
              <PreviewRow
                label="Quote consumed"
                value={formatQuoteAmount(quote.quoteConsumed, pair.quoteAsset)}
              />
              <PreviewRow
                label="Quote refund"
                value={formatQuoteAmount(quote.quoteRefund, pair.quoteAsset)}
              />
            </>
          )}
          {!isBuy && quote !== null && "grossQuoteOut" in quote && (
            <PreviewRow
              label="Gross quote out"
              value={formatQuoteAmount(quote.grossQuoteOut, pair.quoteAsset)}
            />
          )}
          {quote !== null && "burnAmount" in quote && quote.burnAmount > 0n && (
            <PreviewRow
              label="Burn estimate"
              value={formatTokenDisplay(quote.burnAmount, pair.token.decimals, pair.token.symbol)}
            />
          )}
          {quote !== null && "creatorFee" in quote && quote.creatorFee > 0n && (
            <PreviewRow
              label="TokenOwner fee"
              value={formatDatoshiAsGas(quote.creatorFee)}
            />
          )}
          {quote !== null && "platformFee" in quote && quote.platformFee > 0n && (
            <PreviewRow
              label="Platform fee"
              value={formatDatoshiAsGas(quote.platformFee)}
            />
          )}
          {isBuy && quote !== null && requiredGasFee > 0n && "grossQuoteIn" in quote && (
            <PreviewRow
              label="Total wallet outflow"
              value={formatQuoteAmount(quote.grossQuoteIn + requiredGasFee, pair.quoteAsset)}
            />
          )}
          {!isBuy && (
            <PreviewRow
              label="GAS obligations"
              value={formatDatoshiAsGas(requiredGasFee)}
            />
          )}
          {quote !== null && "nextPrice" in quote && (
            <PreviewRow
              label="Next price"
              value={formatMarketPrice(
                quote.nextPrice,
                pair.quoteAsset,
                pair.token.decimals
              )}
            />
          )}
        </div>

        {!isBuy && requiredGasFee > 0n && (
          <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
            Creator and platform fee pulls remain GAS-denominated even when the pair quote asset is{" "}
            {pair.quoteAsset}.
          </p>
        )}

        {connectedAddress === null && (
          <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--forge-text-muted)" }}>
            Preview stays visible without a wallet. Connect only when you are ready to sign.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            if (connectedAddress === null) {
              onConnectClick();
              return;
            }
            void submit();
          }}
          disabled={disableCta}
          className="mt-6 w-full rounded-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
            color: "var(--forge-text-primary)",
          }}
        >
          {callToActionLabel}
        </button>
      </section>

      {failure && (
        <TradeFailureSheet
          failure={failure}
          onAdjustAmount={dismissFailure}
        />
      )}
    </>
  );
}
