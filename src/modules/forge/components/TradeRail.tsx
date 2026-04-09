"use client";

import { useEffect } from "react";
import {
  formatQuoteAmount,
  formatTokenDisplay,
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
        background: active
          ? "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))"
          : "rgba(255,255,255,0.04)",
        color: active ? "var(--forge-text-primary)" : "var(--forge-text-muted)",
      }}
    >
      {label}
    </button>
  );
}

function PresetChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
      style={{
        background: "rgba(255,255,255,0.05)",
        color: "var(--forge-text-muted)",
      }}
    >
      {label}
    </button>
  );
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
    impactTone,
    requiresImpactAcknowledgement,
    impactAcknowledged,
    setImpactAcknowledged,
    submit,
  } = useMarketTradeFlow(pair, connectedAddress, gasBalance);

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
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              className="text-xs uppercase tracking-[0.24em]"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Trade Rail
            </p>
            <h2
              className="mt-2 text-2xl font-semibold"
              style={{ color: "var(--forge-text-primary)" }}
            >
              Buy / Sell
            </h2>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "var(--forge-text-muted)",
            }}
          >
            {pair.quoteAsset} pair
          </span>
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
                        : formatQuoteAmount(quoteBalance, pair.quoteAsset)
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

          <div>
            <label
              htmlFor="trade-slippage"
              className="text-sm font-medium"
              style={{ color: "var(--forge-text-muted)" }}
            >
              Slippage tolerance
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
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: "var(--forge-text-primary)" }}
              />
              <span className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
                %
              </span>
            </div>
          </div>
        </div>

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
            {(isBuy && "capped" in quote && (quote.capped || quote.quoteRefund > 0n)) && (
              <div
                className="mt-4 rounded-[18px] px-4 py-3 text-sm"
                style={{
                  background: "rgba(255, 193, 7, 0.12)",
                  color: "#ffd166",
                }}
              >
                This buy is capped by the remaining curve inventory. Excess {pair.quoteAsset} will
                be refunded after execution.
              </div>
            )}

            {impactTone !== "none" && (
              <div
                className="mt-4 rounded-[18px] px-4 py-3 text-sm"
                style={{
                  background:
                    impactTone === "danger"
                      ? "rgba(255,82,82,0.1)"
                      : "rgba(255, 193, 7, 0.12)",
                  color: impactTone === "danger" ? "var(--forge-error)" : "#ffd166",
                }}
              >
                <p>
                  Price impact is currently {priceImpactLabel}.
                  {impactTone === "danger"
                    ? " This trade needs explicit acknowledgement before signature."
                    : " Review the preview before signing."}
                </p>
                {requiresImpactAcknowledgement && (
                  <label className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={impactAcknowledged}
                      onChange={(event) => setImpactAcknowledged(event.target.checked)}
                    />
                    <span>I understand this trade has more than 15% price impact.</span>
                  </label>
                )}
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
                  ? formatTokenDisplay(
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
                  ? formatTokenDisplay(minimumOutput, pair.token.decimals, pair.token.symbol)
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
          {!isBuy && quote !== null && "creatorFee" in quote && quote.creatorFee > 0n && (
            <PreviewRow
              label="Creator fee"
              value={formatDatoshiAsGas(quote.creatorFee)}
            />
          )}
          {!isBuy && quote !== null && "platformFee" in quote && quote.platformFee > 0n && (
            <PreviewRow
              label="Platform fee"
              value={formatDatoshiAsGas(quote.platformFee)}
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
              value={formatQuoteAmount(quote.nextPrice, pair.quoteAsset)}
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
