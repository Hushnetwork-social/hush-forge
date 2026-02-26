/**
 * useForgeForm - Manages the Forge token creation form.
 */

import { useEffect, useMemo, useState } from "react";
import { WalletRejectedError } from "../neo-dapi-adapter";
import { fetchCreationFee, submitForge, type GasBalanceCheck } from "../forge-service";
import type { ForgeParams } from "../types";

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

  gasCheckResult: GasBalanceCheck | null;

  submitting: boolean;
  submittedTxHash: string | null;
  submitError: string | null;
  submit: () => Promise<void>;
}

export function useForgeForm(
  _address: string | null,
  gasBalance: bigint
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

  const gasCheckResult = useMemo<GasBalanceCheck | null>(() => {
    if (feeLoading) return null;
    const required = creationFeeDatoshi + creationFeeDatoshi / 10n;
    return {
      sufficient: gasBalance >= required,
      actual: gasBalance,
      required,
    };
  }, [feeLoading, creationFeeDatoshi, gasBalance]);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = "Name is required";
    }

    if (!/^[A-Z]{2,10}$/.test(symbol)) {
      errs.symbol = "Symbol must be 2-10 uppercase letters only";
    }

    const supplyNum = Number(supply);
    if (!supply || Number.isNaN(supplyNum) || supplyNum <= 0 || !Number.isInteger(supplyNum)) {
      errs.supply = "Supply must be a positive integer";
    }

    const decimalsNum = Number(decimals);
    if (decimals === "" || Number.isNaN(decimalsNum) || decimalsNum < 0 || decimalsNum > 18 || !Number.isInteger(decimalsNum)) {
      errs.decimals = "Decimals must be an integer between 0 and 18";
    }

    if (imageUrl.trim() && !/^https?:\/\/.+/.test(imageUrl.trim())) {
      errs.imageUrl = "Must be a valid http/https URL";
    }

    const creatorFeeNum = Number(creatorFee);
    if (creatorFee.trim() !== "" && (Number.isNaN(creatorFeeNum) || creatorFeeNum < 0 || creatorFeeNum > 0.05)) {
      errs.creatorFee = "Maximum 0.05 GAS";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const decimalsNum = Number(decimals);
      const creatorFeeGas = creatorFee.trim() === "" ? 0 : Number(creatorFee);

      const params: ForgeParams = {
        name: name.trim(),
        symbol,
        supply: BigInt(supply) * (10n ** BigInt(decimalsNum)),
        decimals: decimalsNum,
        mode: "community",
        imageUrl: imageUrl.trim() || undefined,
        creatorFeeRate: Math.round(creatorFeeGas * 100_000_000),
      };

      const txHash = await submitForge(params, creationFeeDatoshi);
      setSubmittedTxHash(txHash);
    } catch (err) {
      if (err instanceof WalletRejectedError) {
        setSubmitError("Transaction cancelled. Please try again.");
      } else {
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
    gasCheckResult,
    submitting,
    submittedTxHash,
    submitError,
    submit,
  };
}