/**
 * useForgeForm - Manages the Forge token creation form.
 */

import { useEffect, useMemo, useState } from "react";
import { WalletRejectedError } from "../neo-dapi-adapter";
import {
  checkSymbolAvailability,
  fetchCreationFee,
  quoteCreationCost,
  submitForge,
  type GasBalanceCheck,
} from "../forge-service";
import type { CreationCostQuote, ForgeParams } from "../types";

export type ImagePreviewState = "idle" | "loading" | "ok" | "error";

export interface UseForgeFormResult {
  name: string;
  setName: (v: string) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  supply: string;
  setSupply: (v: string) => void;
  decimals: string;
  setDecimals: (v: string) => void;
  imageUrl: string;
  setImageUrl: (v: string) => void;
  imagePreview: ImagePreviewState;
  creatorFee: string;
  setCreatorFee: (v: string) => void;

  errors: Record<string, string>;
  validateForm: () => void;

  creationFeeDatoshi: bigint;
  creationFeeDisplay: string;
  feeLoading: boolean;
  creationCostQuote: CreationCostQuote | null;
  creationCostLoading: boolean;
  creationCostError: string | null;

  gasCheckResult: GasBalanceCheck | null;

  canSubmit: boolean;
  submitting: boolean;
  submittedTxHash: string | null;
  submitError: string | null;
  submit: () => Promise<void>;
}

function getValidationErrors(fields: {
  name: string;
  symbol: string;
  supply: string;
  decimals: string;
  imageUrl: string;
  creatorFee: string;
}): Record<string, string> {
  const errs: Record<string, string> = {};

  if (!fields.name.trim()) {
    errs.name = "Name is required";
  }

  if (!/^[A-Z]{2,10}$/.test(fields.symbol)) {
    errs.symbol = "Symbol must be 2-10 uppercase letters only";
  }

  const supplyNum = Number(fields.supply);
  if (
    !fields.supply ||
    Number.isNaN(supplyNum) ||
    supplyNum <= 0 ||
    !Number.isInteger(supplyNum)
  ) {
    errs.supply = "Supply must be a positive integer";
  }

  const decimalsNum = Number(fields.decimals);
  if (
    fields.decimals === "" ||
    Number.isNaN(decimalsNum) ||
    decimalsNum < 0 ||
    decimalsNum > 18 ||
    !Number.isInteger(decimalsNum)
  ) {
    errs.decimals = "Decimals must be an integer between 0 and 18";
  }

  if (fields.imageUrl.trim() && !/^https?:\/\/.+/.test(fields.imageUrl.trim())) {
    errs.imageUrl = "Must be a valid http/https URL";
  }

  const creatorFeeNum = Number(fields.creatorFee);
  if (
    fields.creatorFee.trim() !== "" &&
    (Number.isNaN(creatorFeeNum) || creatorFeeNum < 0 || creatorFeeNum > 0.05)
  ) {
    errs.creatorFee = "Maximum 0.05 GAS";
  }

  return errs;
}

function buildForgeParams(fields: {
  name: string;
  symbol: string;
  supply: string;
  decimals: string;
  imageUrl: string;
  creatorFee: string;
}): ForgeParams {
  const decimalsNum = Number(fields.decimals);
  const creatorFeeGas =
    fields.creatorFee.trim() === "" ? 0 : Number(fields.creatorFee);

  return {
    name: fields.name.trim(),
    symbol: fields.symbol,
    supply: BigInt(fields.supply) * 10n ** BigInt(decimalsNum),
    decimals: decimalsNum,
    mode: "community",
    imageUrl: fields.imageUrl.trim() || undefined,
    creatorFeeRate: Math.round(creatorFeeGas * 100_000_000),
  };
}

export function useForgeForm(
  _address: string | null,
  gasBalance: bigint,
  existingSymbols: string[] = []
): UseForgeFormResult {
  const [name, setName] = useState("");
  const [symbol, setSymbolRaw] = useState("");
  const [supply, setSupply] = useState("");
  const [decimals, setDecimals] = useState("8");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreviewState>("idle");
  const [creatorFee, setCreatorFee] = useState("0");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [creationFeeDatoshi, setCreationFeeDatoshi] = useState(0n);
  const [creationFeeDisplay, setCreationFeeDisplay] = useState("15");
  const [feeLoading, setFeeLoading] = useState(true);
  const [creationCostQuote, setCreationCostQuote] =
    useState<CreationCostQuote | null>(null);
  const [creationCostLoading, setCreationCostLoading] = useState(false);
  const [creationCostError, setCreationCostError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setSymbol = (v: string) => setSymbolRaw(v.toUpperCase());

  useEffect(() => {
    fetchCreationFee()
      .then((fee) => {
        setCreationFeeDatoshi(fee.datoshi);
        setCreationFeeDisplay(fee.displayGas);
      })
      .catch(() => {})
      .finally(() => {
        setFeeLoading(false);
      });
  }, []);

  useEffect(() => {
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      setImagePreview("idle");
      return;
    }

    setImagePreview("loading");
    const timer = setTimeout(() => {
      const img = new Image();
      img.onload = () => setImagePreview("ok");
      img.onerror = () => {
        const retry = new Image();
        retry.onload = () => setImagePreview("ok");
        retry.onerror = () => setImagePreview("error");
        retry.src = `${trimmed}?_=1`;
      };
      img.src = trimmed;
    }, 600);

    return () => clearTimeout(timer);
  }, [imageUrl]);

  useEffect(() => {
    let cancelled = false;

    if (feeLoading || !_address) {
      setCreationCostQuote(null);
      setCreationCostLoading(false);
      setCreationCostError(null);
      return () => {
        cancelled = true;
      };
    }

    const nextErrors = getValidationErrors({
      name,
      symbol,
      supply,
      decimals,
      imageUrl,
      creatorFee,
    });

    if (Object.keys(nextErrors).length > 0) {
      setCreationCostQuote(null);
      setCreationCostLoading(false);
      setCreationCostError(null);
      return () => {
        cancelled = true;
      };
    }

    const params = buildForgeParams({
      name,
      symbol,
      supply,
      decimals,
      imageUrl,
      creatorFee,
    });

    setCreationCostLoading(true);
    setCreationCostError(null);

    void quoteCreationCost(_address, params, creationFeeDatoshi)
      .then((quote) => {
        if (cancelled) return;
        setCreationCostQuote(quote);
        setSubmitError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setCreationCostQuote(null);
        setCreationCostError(
          err instanceof Error
            ? err.message
            : "Unable to estimate token creation cost right now."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setCreationCostLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    _address,
    creationFeeDatoshi,
    creatorFee,
    decimals,
    feeLoading,
    imageUrl,
    name,
    supply,
    symbol,
  ]);

  const gasCheckResult = useMemo<GasBalanceCheck | null>(() => {
    if (feeLoading) return null;
    const required =
      creationCostQuote?.estimatedTotalWalletOutflowDatoshi ??
      creationFeeDatoshi + creationFeeDatoshi / 10n;
    return {
      sufficient: gasBalance >= required,
      actual: gasBalance,
      required,
    };
  }, [creationCostQuote, feeLoading, creationFeeDatoshi, gasBalance]);

  function validate(): boolean {
    const errs = getValidationErrors({
      name,
      symbol,
      supply,
      decimals,
      imageUrl,
      creatorFee,
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function extractDuplicateSymbolMessage(err: unknown): string | null {
    const raw =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    const normalized = raw.toLowerCase();
    const looksLikeDuplicate =
      (normalized.includes("symbol") &&
        (normalized.includes("already") ||
          normalized.includes("duplicate") ||
          normalized.includes("in use") ||
          normalized.includes("exists"))) ||
      normalized.includes("duplicate symbol");
    if (!looksLikeDuplicate) return null;
    return `Symbol ${symbol} is already in use. Choose a different symbol.`;
  }

  const canSubmit =
    !submitting &&
    !feeLoading &&
    !creationCostLoading &&
    creationCostError === null &&
    creationCostQuote !== null &&
    (gasCheckResult?.sufficient ?? false);

  async function submit() {
    if (!validate()) return;
    if (creationCostLoading || creationCostQuote === null || creationCostError !== null) {
      setSubmitError(
        creationCostError ??
          "Creation cost estimate is not ready yet. Wait for the quote before signing."
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const inMemoryDuplicate = existingSymbols.some(
        (s) => s.trim().toUpperCase() === symbol.trim().toUpperCase()
      );
      if (inMemoryDuplicate) {
        const msg = `Symbol ${symbol} is already in use. Choose a different symbol.`;
        setErrors((prev) => ({ ...prev, symbol: msg }));
        setSubmitError(msg);
        return;
      }

      const symbolAvailability = await checkSymbolAvailability(symbol);
      if (!symbolAvailability.available) {
        setErrors((prev) => ({
          ...prev,
          symbol: symbolAvailability.reason ?? "Symbol is already in use",
        }));
        return;
      }

      const params = buildForgeParams({
        name,
        symbol,
        supply,
        decimals,
        imageUrl,
        creatorFee,
      });

      const txHash = await submitForge(params, creationFeeDatoshi);
      setSubmittedTxHash(txHash);
    } catch (err) {
      if (err instanceof WalletRejectedError) {
        setSubmitError("Transaction cancelled. Please try again.");
      } else {
        const duplicateSymbolMsg = extractDuplicateSymbolMessage(err);
        if (duplicateSymbolMsg) {
          setErrors((prev) => ({ ...prev, symbol: duplicateSymbolMsg }));
          setSubmitError(duplicateSymbolMsg);
          return;
        }
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? JSON.stringify(err)
              : String(err);
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return {
    name,
    setName,
    symbol,
    setSymbol,
    supply,
    setSupply,
    decimals,
    setDecimals,
    imageUrl,
    setImageUrl,
    imagePreview,
    creatorFee,
    setCreatorFee,
    errors,
    validateForm: validate,
    creationFeeDatoshi,
    creationFeeDisplay,
    feeLoading,
    creationCostQuote,
    creationCostLoading,
    creationCostError,
    gasCheckResult,
    canSubmit,
    submitting,
    submittedTxHash,
    submitError,
    submit,
  };
}
