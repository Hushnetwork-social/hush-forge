"use client";

import { useMemo, useState } from "react";
import { invokeUpdateMetadata, WalletRejectedError } from "../neo-dapi-adapter";
import type { TokenInfo } from "../types";
import type { StagedChange } from "./admin-types";

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

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value.trim());
}

export function AdminTabIdentity({ token, factoryHash, onTxSubmitted, onStageChange }: Props) {
  const [imageUrl, setImageUrl] = useState(token.imageUrl ?? "");
  const [hidePreview, setHidePreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPreview = useMemo(
    () => isHttpUrl(imageUrl) && !hidePreview,
    [imageUrl, hidePreview]
  );

  const isDirty = imageUrl.trim() !== (token.imageUrl ?? "").trim();

  async function handleSubmit() {
    if (!factoryHash) {
      setError("Factory hash is not configured.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const txHash = await invokeUpdateMetadata(factoryHash, token.contractHash, imageUrl.trim());
      onTxSubmitted(txHash, "Updating image URL...");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleStage() {
    if (!isDirty) return;
    onStageChange?.({
      id: `metadata-${token.contractHash}`,
      type: "metadata",
      label: "Update image URL",
      payload: { imageUrl: imageUrl.trim() },
    });
  }

  return (
    <section className="space-y-4" aria-label="Admin Identity Tab">
      <div>
        <label className="text-sm mb-1 block" style={{ color: "var(--forge-text-muted)" }}>
          Token Name (Immutable)
        </label>
        <input
          value={token.name}
          disabled
          readOnly
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgba(255,255,255,0.02)",
            color: "var(--forge-text-muted)",
            border: "1px solid var(--forge-border-subtle)",
            cursor: "not-allowed",
          }}
        />
      </div>

      <div>
        <label className="text-sm mb-1 block" style={{ color: "var(--forge-text-muted)" }}>
          Symbol (Immutable)
        </label>
        <input
          value={token.symbol}
          disabled
          readOnly
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgba(255,255,255,0.02)",
            color: "var(--forge-text-muted)",
            border: "1px solid var(--forge-border-subtle)",
            cursor: "not-allowed",
          }}
        />
      </div>

      <div>
        <label htmlFor="admin-image-url" className="text-sm mb-1 block" style={{ color: "var(--forge-text-muted)" }}>
          Image URL
        </label>
        <input
          id="admin-image-url"
          value={imageUrl}
          onChange={(e) => {
            setImageUrl(e.target.value);
            setHidePreview(false);
          }}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{
            background: "var(--forge-bg-primary)",
            color: "var(--forge-text-primary)",
            border: "1px solid var(--forge-border-medium)",
          }}
        />

        {canPreview && (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl.trim()}
              alt="Token preview"
              width={48}
              height={48}
              onError={() => setHidePreview(true)}
              style={{ objectFit: "cover", borderRadius: 9999 }}
            />
          </div>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
        Requires a 0.5 GAS update fee.
      </p>

      {error && <p role="alert" className="text-xs" style={{ color: "var(--forge-error)" }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!isDirty || submitting}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
            color: "var(--forge-text-primary)",
          }}
        >
          {submitting ? "Updating..." : "Update Image URL"}
        </button>
        <button
          onClick={handleStage}
          disabled={!isDirty}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ border: "1px solid var(--forge-border-medium)", color: "var(--forge-text-primary)" }}
        >
          Stage
        </button>
      </div>
    </section>
  );
}
