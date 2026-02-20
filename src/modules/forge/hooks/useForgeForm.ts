/**
 * useForgeForm — Manages the Forge token creation form.
 *
 * Responsibilities:
 * - Controlled form fields with setters (symbol auto-uppercased)
 * - On-submit validation (field errors map)
 * - Fee fetch on mount (fetchCreationFee)
 * - GAS sufficiency check derived from gasBalance prop vs fee + 10% buffer
 * - TX submission orchestration via ForgeService.submitForge()
 */

import { useEffect, useMemo, useState } from "react";
import { WalletRejectedError } from "../neo-dapi-adapter";
import { fetchCreationFee, submitForge, type GasBalanceCheck } from "../forge-service";
import type { ForgeParams } from "../types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UseForgeFormResult {
  // Form fields
  name: string;
  setName: (v: string) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  supply: string;
  setSupply: (v: string) => void;
  decimals: string;
  setDecimals: (v: string) => void;

  // Validation
  errors: Record<string, string>;

  // Fee
  creationFeeDatoshi: bigint;
  creationFeeDisplay: string;
  feeLoading: boolean;

  // GAS balance check
  gasCheckResult: GasBalanceCheck | null;

  // Submit
  submitting: boolean;
  submittedTxHash: string | null;
  submitError: string | null;
  submit: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param address  - Connected wallet address (used implicitly by submitForge via dAPI state)
 * @param gasBalance - GAS balance in datoshi, from useWallet().gasBalance
 */
export function useForgeForm(
  _address: string | null,
  gasBalance: bigint
): UseForgeFormResult {
  // Form fields
  const [name, setName] = useState("");
  const [symbol, setSymbolRaw] = useState("");
  const [supply, setSupply] = useState("");
  const [decimals, setDecimals] = useState("8");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fee state
  const [creationFeeDatoshi, setCreationFeeDatoshi] = useState(0n);
  const [creationFeeDisplay, setCreationFeeDisplay] = useState("15");
  const [feeLoading, setFeeLoading] = useState(true);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-uppercase symbol setter
  const setSymbol = (v: string) => setSymbolRaw(v.toUpperCase());

  // Fetch fee once on mount
  useEffect(() => {
    fetchCreationFee()
      .then((fee) => {
        setCreationFeeDatoshi(fee.datoshi);
        setCreationFeeDisplay(fee.displayGas);
      })
      .catch(() => {
        // fetchCreationFee already falls back to 15 GAS internally;
        // this catch guards against unexpected rejections to prevent
        // feeLoading from hanging forever.
      })
      .finally(() => {
        setFeeLoading(false);
      });
  }, []);

  // GAS sufficiency check — recomputed whenever fee or gasBalance changes
  const gasCheckResult = useMemo<GasBalanceCheck | null>(() => {
    if (feeLoading) return null;
    const required = creationFeeDatoshi + creationFeeDatoshi / 10n;
    return {
      sufficient: gasBalance >= required,
      actual: gasBalance,
      required,
    };
  }, [feeLoading, creationFeeDatoshi, gasBalance]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = "Name is required";
    }

    if (!/^[A-Z]{2,10}$/.test(symbol)) {
      errs.symbol = "Symbol must be 2-10 uppercase letters only";
    }

    const supplyNum = Number(supply);
    if (
      !supply ||
      isNaN(supplyNum) ||
      supplyNum <= 0 ||
      !Number.isInteger(supplyNum)
    ) {
      errs.supply = "Supply must be a positive integer";
    }

    const decimalsNum = Number(decimals);
    if (
      decimals === "" ||
      isNaN(decimalsNum) ||
      decimalsNum < 0 ||
      decimalsNum > 18 ||
      !Number.isInteger(decimalsNum)
    ) {
      errs.decimals = "Decimals must be an integer between 0 and 18";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Submit orchestration
  // ---------------------------------------------------------------------------

  async function submit() {
    console.log("[forge] submit() — name:", name, "symbol:", symbol, "supply:", supply, "decimals:", decimals);
    if (!validate()) {
      console.warn("[forge] validation failed — aborting");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const decimalsNum = Number(decimals);
      const params: ForgeParams = {
        name: name.trim(),
        symbol,
        // supply field is in display units — convert to raw (smallest) units
        supply: BigInt(supply) * (10n ** BigInt(decimalsNum)),
        decimals: decimalsNum,
        mode: "community",
      };
      console.log("[forge] calling submitForge — params:", params, "fee datoshi:", creationFeeDatoshi.toString());
      const txHash = await submitForge(params, creationFeeDatoshi);
      console.log("[forge] TX submitted — txHash:", txHash);
      setSubmittedTxHash(txHash);
    } catch (err) {
      console.error("[forge] submit error:", err);
      if (err instanceof WalletRejectedError) {
        setSubmitError("Transaction cancelled. Please try again.");
      } else {
        // Serialize non-Error objects so the user sees something useful
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? JSON.stringify(err)
              : String(err);
        console.error("[forge] error message to display:", msg);
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
    errors,
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
