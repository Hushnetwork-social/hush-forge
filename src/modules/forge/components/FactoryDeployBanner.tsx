"use client";

import type { FactoryDeployStatus } from "../hooks/useFactoryDeployment";

interface Props {
  status: FactoryDeployStatus;
  deployError: string | null;
  onDeploy: () => void;
  onInitialize: () => void;
  onRecheck: () => void;
}

export function FactoryDeployBanner({
  status,
  deployError,
  onDeploy,
  onInitialize,
  onRecheck,
}: Props) {
  // Only show the banner when there is a problem to fix.
  // "deployed" (fully ready) and idle/checking states are silent.
  if (
    status === "idle" ||
    status === "checking" ||
    status === "deployed"
  ) {
    return null;
  }

  if (status === "deploying" || status === "initializing") {
    return (
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{
          background: "rgba(255,167,38,0.08)",
          border: "1px solid var(--forge-color-accent)",
        }}
      >
        <span className="animate-spin text-lg">⚙️</span>
        <span className="text-sm" style={{ color: "var(--forge-color-accent)" }}>
          {status === "deploying"
            ? "Deploying TokenFactory… waiting for confirmation"
            : "Initializing TokenFactory with TokenTemplate… waiting for confirmation"}
        </span>
      </div>
    );
  }

  if (status === "not-initialized") {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(255,167,38,0.08)",
          border: "1px solid var(--forge-color-accent)",
        }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--forge-color-accent)" }}>
          TokenFactory needs initialization
        </p>
        {deployError && (
          <p className="text-xs mb-2" style={{ color: "var(--forge-error)" }}>
            {deployError}
          </p>
        )}
        <p className="text-xs mb-3" style={{ color: "var(--forge-text-muted)" }}>
          The factory contract is deployed but has not been loaded with the TokenTemplate yet.
          Click below to upload the template — this is a one-time setup (~1 GAS).
        </p>
        <div className="flex gap-2">
          <button
            onClick={onInitialize}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: "var(--forge-color-accent)",
              color: "var(--forge-text-primary)",
            }}
          >
            Initialize Factory
          </button>
          <button
            onClick={onRecheck}
            className="px-3 py-2 rounded-lg text-sm opacity-70 hover:opacity-100"
            style={{
              border: "1px solid var(--forge-border-medium)",
              color: "var(--forge-text-muted)",
            }}
          >
            Recheck
          </button>
        </div>
      </div>
    );
  }

  // "not-deployed" or "deploy-error"
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,152,0,0.08)",
        border: "1px solid var(--forge-color-primary)",
      }}
    >
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--forge-color-primary)" }}>
        TokenFactory not deployed on this network
      </p>
      {deployError && (
        <p className="text-xs mb-2" style={{ color: "var(--forge-error)" }}>
          {deployError}
        </p>
      )}
      <p className="text-xs mb-3" style={{ color: "var(--forge-text-muted)" }}>
        Deploy it now — your connected wallet will be set as owner and will pay the
        deployment GAS fee (~10 GAS).
      </p>
      <div className="flex gap-2">
        <button
          onClick={onDeploy}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: "var(--forge-color-primary)",
            color: "var(--forge-text-primary)",
          }}
        >
          Deploy TokenFactory
        </button>
        {status === "deploy-error" && (
          <button
            onClick={onRecheck}
            className="px-3 py-2 rounded-lg text-sm opacity-70 hover:opacity-100"
            style={{
              border: "1px solid var(--forge-border-medium)",
              color: "var(--forge-text-muted)",
            }}
          >
            Recheck
          </button>
        )}
      </div>
    </div>
  );
}
