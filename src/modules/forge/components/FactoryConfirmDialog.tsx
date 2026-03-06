"use client";

interface Props {
  title: string;
  body: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function FactoryConfirmDialog({ title, body, onCancel, onConfirm }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Action"
    >
      <div
        className="w-full max-w-xl rounded-2xl p-6"
        style={{
          background: "var(--forge-bg-card)",
          border: "1px solid var(--forge-border-medium)",
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold" style={{ color: "var(--forge-text-primary)" }}>
            {title}
          </h2>
          <button
            aria-label="Close confirmation"
            onClick={onCancel}
            className="text-sm opacity-70 hover:opacity-100"
            style={{ color: "var(--forge-text-muted)" }}
          >
            Close
          </button>
        </div>
        <div className="space-y-3 text-sm" style={{ color: "var(--forge-text-muted)" }}>
          {body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{
              border: "1px solid var(--forge-border-medium)",
              color: "var(--forge-text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{
              background: "linear-gradient(135deg, var(--forge-color-secondary), var(--forge-color-primary))",
              color: "var(--forge-text-primary)",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
