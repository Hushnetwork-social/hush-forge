import { useEffect, useMemo, useState } from "react";
import { toUiErrorMessage } from "./components/error-utils";
import { invokeTokenTransfer } from "./neo-dapi-adapter";
import { addressToHash160 } from "./neo-rpc-client";
import {
  buildTransferConfirmationSummary,
  isFactoryToken,
  parseTokenAmountInput,
} from "./token-economics-logic";
import { quoteTokenTransfer } from "./transfer-quote-service";
import type {
  TokenInfo,
  TransferConfirmationSummary,
  TransferQuote,
  WalletBalance,
} from "./types";

export interface UseTransferFlowResult {
  available: boolean;
  recipientInput: string;
  setRecipientInput: (value: string) => void;
  amountInput: string;
  setAmountInput: (value: string) => void;
  validationError: string | null;
  quoteLoading: boolean;
  quoteError: string | null;
  confirmation: TransferConfirmationSummary | null;
  canSubmit: boolean;
  submitting: boolean;
  submittedTxHash: string | null;
  submitError: string | null;
  submit: () => Promise<void>;
  reset: () => void;
}

function normalizeRecipientInput(value: string): string {
  return value.trim();
}

function validateTransferInput(
  token: TokenInfo | null,
  balance: WalletBalance | null,
  connectedAddress: string | null,
  recipientInput: string,
  amountInput: string,
  amountRaw: bigint | null,
  available: boolean
): string | null {
  if (!available || token === null || balance === null || !connectedAddress) {
    return "Transfer is unavailable for the selected token.";
  }

  const recipient = normalizeRecipientInput(recipientInput);
  if (!recipient) {
    return "Recipient address is required.";
  }

  try {
    addressToHash160(recipient);
  } catch {
    return "Enter a valid Neo N3 recipient address.";
  }

  if (!amountInput.trim()) {
    return "Transfer amount is required.";
  }

  if (amountRaw === null) {
    return `Enter a valid ${token.symbol} amount with up to ${token.decimals} decimal places.`;
  }

  if (amountRaw <= 0n) {
    return "Transfer amount must be greater than 0.";
  }

  if (amountRaw > balance.amount) {
    return "Transfer amount cannot exceed the current wallet balance.";
  }

  return null;
}

export function useTransferFlow(
  token: TokenInfo | null,
  balance: WalletBalance | null,
  connectedAddress: string | null
): UseTransferFlowResult {
  const [recipientInput, setRecipientInputState] = useState("");
  const [amountInput, setAmountInputState] = useState("");
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const available =
    isFactoryToken(token) &&
    balance !== null &&
    balance.amount > 0n &&
    connectedAddress !== null;

  const amountRaw =
    token === null ? null : parseTokenAmountInput(amountInput, token.decimals);

  const validationError = validateTransferInput(
    token,
    balance,
    connectedAddress,
    recipientInput,
    amountInput,
    amountRaw,
    available
  );

  useEffect(() => {
    let cancelled = false;

    if (
      validationError !== null ||
      token === null ||
      connectedAddress === null ||
      amountRaw === null
    ) {
      setQuote(null);
      setQuoteLoading(false);
      setQuoteError(null);
      return () => {
        cancelled = true;
      };
    }

    setQuoteLoading(true);
    setQuoteError(null);

    void quoteTokenTransfer(
      token.contractHash,
      connectedAddress,
      normalizeRecipientInput(recipientInput),
      amountRaw
    )
      .then((nextQuote) => {
        if (cancelled) return;
        setQuote(nextQuote);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(toUiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    amountRaw,
    connectedAddress,
    recipientInput,
    token,
    validationError,
  ]);

  const confirmation = useMemo(
    () => buildTransferConfirmationSummary(token, amountRaw, quote),
    [amountRaw, quote, token]
  );

  const canSubmit =
    !submitting &&
    validationError === null &&
    quoteError === null &&
    !quoteLoading &&
    amountRaw !== null &&
    quote !== null;

  function setRecipientInput(value: string) {
    setRecipientInputState(value);
    setSubmitError(null);
    setSubmittedTxHash(null);
  }

  function setAmountInput(value: string) {
    setAmountInputState(value);
    setSubmitError(null);
    setSubmittedTxHash(null);
  }

  function reset() {
    setRecipientInputState("");
    setAmountInputState("");
    setQuote(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setSubmitting(false);
    setSubmittedTxHash(null);
    setSubmitError(null);
  }

  async function submit() {
    const recipient = normalizeRecipientInput(recipientInput);
    if (
      validationError !== null ||
      token === null ||
      amountRaw === null ||
      quote === null
    ) {
      setSubmitError(validationError ?? quoteError ?? "Transfer quote is unavailable.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmittedTxHash(null);

    try {
      const txHash = await invokeTokenTransfer(token.contractHash, recipient, amountRaw);
      setSubmittedTxHash(txHash);
    } catch (err) {
      setSubmitError(toUiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    available,
    recipientInput,
    setRecipientInput,
    amountInput,
    setAmountInput,
    validationError,
    quoteLoading,
    quoteError,
    confirmation,
    canSubmit,
    submitting,
    submittedTxHash,
    submitError,
    submit,
    reset,
  };
}
