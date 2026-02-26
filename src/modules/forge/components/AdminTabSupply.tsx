"use client";

import { useMemo, useState } from "react";
import { addressToHash160 } from "../neo-rpc-client";
import {
  invokeMintTokens,
  invokeSetMaxSupply,
  WalletRejectedError,
} from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";

interface Props {
  token: TokenInfo;
  factoryHash: string;
  onTxSubmitted: (txHash: string, message: string) => void;
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

export function AdminTabSupply({ token, factoryHash, onTxSubmitted }: Props) {
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

  const maxSupplyParsed = useMemo(() => {
    try {
      return BigInt(maxSupply.trim() || "0");
    } catch {
      return null;
    }
  }, [maxSupply]);

  const maxSupplyValid =
    maxSupplyParsed !== null &&
    maxSupplyParsed >= 0n &&
    (maxSupplyParsed === 0n || maxSupplyParsed > token.supply);

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

  return (
    <section className="space-y-5" aria-label="Admin Supply Tab">
      <div className="text-sm" style={{ color: "var(--forge-text-muted)" }}>
        Current supply: <strong style={{ color: "var(--forge-text-primary)" }}>{formatSupply(token.supply, token.decimals)}</strong>
        {" "}| Max supply: <strong style={{ color: "var(--forge-text-primary)" }}>{token.maxSupply ?? "0"}</strong>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>Mint Tokens</h4>
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
        {mintError && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{mintError}</p>}
        <button
          onClick={handleMint}
          disabled={!recipientValid || !mintAmountValid || minting}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))", color: "var(--forge-text-primary)" }}
        >
          {minting ? "Minting..." : "Mint Tokens"}
        </button>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>Max Supply Cap</h4>
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
        <button
          onClick={handleSetMaxSupply}
          disabled={!maxSupplyValid || updatingMax}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "transparent", border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        >
          {updatingMax ? "Updating..." : "Set Max Supply"}
        </button>
      </div>
    </section>
  );
}