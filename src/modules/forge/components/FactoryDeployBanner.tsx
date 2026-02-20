"use client";

import type { FactoryDeployStatus } from "../hooks/useFactoryDeployment";

interface Props {
  status: FactoryDeployStatus;
  factoryHash: string;
  deployError: string | null;
  onDeploy: () => void;
  onInitialize: () => void;
  onRecheck: () => void;
}

export function FactoryDeployBanner({
  status,
  factoryHash,
  deployError,
  onDeploy,
  onInitialize,
  onRecheck,
}: Props) {
  if (status === "idle" || status === "checking") {
    return null;
  }

  // Already deployed and hash was set before this component mounted — nothing to show
  if (status === "deployed" && !factoryHash) {
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

  if (status === "deployed" && factoryHash) {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          background: "rgba(76,175,80,0.08)",
          border: "1px solid #4caf50",
        }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: "#4caf50" }}>
          TokenFactory deployed
        </p>
        <p className="text-xs font-mono mb-2" style={{ color: "var(--forge-text-muted)" }}>
          {factoryHash}
        </p>
        <p className="text-xs" style={{ color: "var(--forge-text-muted)" }}>
          To persist across dev-server restarts, add to{" "}
          <code
            className="px-1 rounded"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            .env.local
          </code>
          :
        </p>
        <pre
          className="mt-1 text-xs p-2 rounded overflow-x-auto"
          style={{ background: "rgba(0,0,0,0.3)", color: "var(--forge-color-accent)" }}
        >
          {`NEXT_PUBLIC_FACTORY_CONTRACT_HASH=${factoryHash}`}
        </pre>
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
