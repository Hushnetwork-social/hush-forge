"use client";

import { useMemo, useState } from "react";
import { addressToHash160 } from "../neo-rpc-client";
import {
  getAddress,
  invokeMintTokens,
  invokeSetMaxSupply,
  WalletRejectedError,
} from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";
import type { StagedChange } from "./admin-types";
import { InfoHint } from "./InfoHint";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (txHash: string, message: string) => void;
  onStageChange?: (change: StagedChange) => void;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof WalletRejectedError) return "Transaction cancelled.";
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatSupply(raw: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  return (raw / factor).toLocaleString();
}

function isValidAddress(address: string): boolean {
  try {
    addressToHash160(address);
    return true;
  } catch {
    return false;
  }
}

function parseWholeTokenInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0n;

  const plainDigits = /^\d+$/;
  const groupedThousands = /^\d{1,3}(?:[.,\s_]\d{3})+$/;
  if (!plainDigits.test(trimmed) && !groupedThousands.test(trimmed)) return null;

  const normalized = trimmed.replace(/[.,\s_]/g, "");
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function formatRawSupply(raw: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  return (raw / factor).toLocaleString();
}

function formatRawSupplyString(raw: string | undefined, decimals: number): string {
  if (!raw) return "0";
  try {
    return formatRawSupply(BigInt(raw), decimals);
  } catch {
    return raw;
  }
}

export function AdminTabSupply({ token, factoryHash, onTxSubmitted, onStageChange }: Props) {
  const [recipient, setRecipient] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [maxSupply, setMaxSupply] = useState(token.maxSupply ?? "0");
  const [mintError, setMintError] = useState<string | null>(null);
  const [maxError, setMaxError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [updatingMax, setUpdatingMax] = useState(false);

  const mintAmountParsed = Number(mintAmount);
  const mintAmountValid = Number.isInteger(mintAmountParsed) && mintAmountParsed > 0;
  const recipientValid = recipient.trim().length > 0 && isValidAddress(recipient.trim());

  const maxSupplyWhole = useMemo(
    () => parseWholeTokenInput(maxSupply.trim() || "0"),
    [maxSupply]
  );
  const maxSupplyParsed = useMemo(
    () => (maxSupplyWhole === null ? null : maxSupplyWhole * (10n ** BigInt(token.decimals))),
    [maxSupplyWhole, token.decimals]
  );

  const maxSupplyValid =
    maxSupplyParsed !== null &&
    maxSupplyParsed >= 0n &&
    (maxSupplyParsed === 0n || maxSupplyParsed > token.supply);
  const adminAddress = getAddress();

  async function handleMint() {
    if (!factoryHash) {
      setMintError("Factory hash is not configured.");
      return;
    }
    if (!recipientValid) {
      setMintError("Enter a valid NEO N3 address.");
      return;
    }
    if (!mintAmountValid) {
      setMintError("Amount must be a positive whole number.");
      return;
    }

    setMinting(true);
    setMintError(null);
    try {
      const amountRaw = BigInt(mintAmountParsed) * (10n ** BigInt(token.decimals));
      const txHash = await invokeMintTokens(
        factoryHash,
        token.contractHash,
        recipient.trim(),
        amountRaw
      );
      onTxSubmitted(txHash, "Minting tokens...");
    } catch (err) {
      setMintError(toErrorMessage(err));
    } finally {
      setMinting(false);
    }
  }

  async function handleSetMaxSupply() {
    if (!factoryHash) {
      setMaxError("Factory hash is not configured.");
      return;
    }
    if (!maxSupplyValid || maxSupplyParsed === null) {
      setMaxError("Must be greater than current supply, or 0 to remove the cap");
      return;
    }

    setUpdatingMax(true);
    setMaxError(null);
    try {
      const txHash = await invokeSetMaxSupply(factoryHash, token.contractHash, maxSupplyParsed);
      onTxSubmitted(txHash, "Updating max supply...");
    } catch (err) {
      setMaxError(toErrorMessage(err));
    } finally {
      setUpdatingMax(false);
    }
  }

  function handleStageMint() {
    if (!recipientValid || !mintAmountValid) return;
    onStageChange?.({
      id: `mint-${token.contractHash}`,
      type: "mint",
      label: `Mint ${mintAmountParsed} ${token.symbol} to ${recipient.trim()}`,
      payload: { to: recipient.trim(), amount: mintAmountParsed },
    });
  }

  function handleStageMaxSupply() {
    if (!maxSupplyValid || maxSupplyParsed === null || maxSupplyWhole === null) return;
    onStageChange?.({
      id: `maxSupply-${token.contractHash}`,
      type: "maxSupply",
      label: `Set max supply to ${maxSupplyWhole.toLocaleString()}`,
      payload: { maxSupply: maxSupplyParsed.toString() },
    });
  }

  function handleUseAdminWallet() {
    if (!adminAddress) {
      setMintError("Connect an administrator wallet first.");
      return;
    }
    setMintError(null);
    setRecipient(adminAddress);
  }

  return (
    <section className="space-y-5" aria-label="Admin Supply Tab">
      <div className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
        Current supply: <strong style={{ color: "var(--forge-text-primary)" }}>{formatSupply(token.supply, token.decimals)}</strong>
        {" "}| Max supply: <strong style={{ color: "var(--forge-text-primary)" }}>{formatRawSupplyString(token.maxSupply, token.decimals)}</strong>
      </div>

      <div className="space-y-2">
        <InfoHint
          label="Mint Tokens"
          hint="Mint creates new tokens and sends them to the recipient wallet you provide. Use the administrator shortcut to mint directly to the connected admin wallet."
        />
        <input
          aria-label="Recipient address"
          placeholder="Recipient address"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
        <input
          aria-label="Mint amount"
          placeholder="Amount"
          value={mintAmount}
          onChange={(e) => setMintAmount(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          Mint sends new {token.symbol} tokens to the recipient wallet address.
        </p>
        {mintError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{mintError}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleUseAdminWallet}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            Mint to administrator wallet
          </button>
          <button
            onClick={handleMint}
            disabled={!recipientValid || !mintAmountValid || minting}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))", color: "var(--forge-text-primary)" }}
          >
            {minting ? "Minting..." : "Mint Tokens"}
          </button>
          <button
            onClick={handleStageMint}
            disabled={!recipientValid || !mintAmountValid}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            Stage
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <InfoHint
          label="Max Supply Cap"
          hint="Hard cap of total token supply. Set 0 to remove the cap. Enter whole tokens (example: 1000000 or 1.000.000). Value must be 0 or greater than current supply."
        />
        <input
          aria-label="New max supply"
          placeholder="New Max Supply (0 = uncapped)"
          value={maxSupply}
          onChange={(e) => setMaxSupply(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--forge-bg-primary)", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        />
        {!maxSupplyValid && (
          <p className="text-xs" style={{ color: "var(--forge-error)" }}>
            Must be greater than current supply, or 0 to remove the cap
          </p>
        )}
        {maxError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{maxError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSetMaxSupply}
            disabled={!maxSupplyValid || updatingMax}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "transparent", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            {updatingMax ? "Updating..." : "Set Max Supply"}
          </button>
          <button
            onClick={handleStageMaxSupply}
            disabled={!maxSupplyValid}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
          >
            Stage
          </button>
        </div>
      </div>
    </section>
  );
}
