import { useState } from "react";
import { toUiErrorMessage } from "./components/error-utils";
import { invokeBurn } from "./neo-dapi-adapter";
import {
  buildBurnConfirmationSummary,
  isFactoryToken,
  parseTokenAmountInput,
} from "./token-economics-logic";
import type {
  BurnConfirmationSummary,
  TokenInfo,
  WalletBalance,
} from "./types";

export interface UseBurnFlowResult {
  available: boolean;
  amountInput: string;
  setAmountInput: (value: string) => void;
  validationError: string | null;
  confirmation: BurnConfirmationSummary | null;
  canSubmit: boolean;
  submitting: boolean;
  submittedTxHash: string | null;
  submitError: string | null;
  submit: () => Promise<void>;
  reset: () => void;
}

function validateBurnInput(
  token: TokenInfo | null,
  balance: WalletBalance | null,
  amountInput: string,
  amountRaw: bigint | null,
  available: boolean
): string | null {
  if (!available || token === null || balance === null) {
    return "Burn is unavailable for the selected token.";
  }

  if (!amountInput.trim()) {
    return "Burn amount is required.";
  }

  if (amountRaw === null) {
    return `Enter a valid ${token.symbol} amount with up to ${token.decimals} decimal places.`;
  }

  if (amountRaw <= 0n) {
    return "Burn amount must be greater than 0.";
  }

  if (amountRaw > balance.amount) {
    return "Burn amount cannot exceed the current wallet balance.";
  }

  return null;
}

export function useBurnFlow(
  token: TokenInfo | null,
  balance: WalletBalance | null
): UseBurnFlowResult {
  const [amountInput, setAmountInputState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const available =
    isFactoryToken(token) && balance !== null && balance.amount > 0n;
  const amountRaw =
    token === null ? null : parseTokenAmountInput(amountInput, token.decimals);
  const validationError = validateBurnInput(
    token,
    balance,
    amountInput,
    amountRaw,
    available
  );
  const confirmation = buildBurnConfirmationSummary(token, amountRaw);
  const canSubmit = !submitting && validationError === null && amountRaw !== null;

  function setAmountInput(value: string) {
    setAmountInputState(value);
    setSubmitError(null);
    setSubmittedTxHash(null);
  }

  function reset() {
    setAmountInputState("");
    setSubmitting(false);
    setSubmittedTxHash(null);
    setSubmitError(null);
  }

  async function submit() {
    if (validationError !== null || token === null || amountRaw === null) {
      setSubmitError(validationError ?? "Burn amount is invalid.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmittedTxHash(null);

    try {
      const txHash = await invokeBurn(token.contractHash, amountRaw);
      setSubmittedTxHash(txHash);
    } catch (err) {
      setSubmitError(toUiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    available,
    amountInput,
    setAmountInput,
    validationError,
    confirmation,
    canSubmit,
    submitting,
    submittedTxHash,
    submitError,
    submit,
    reset,
  };
}
