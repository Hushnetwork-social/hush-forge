"use client";

interface InfoHintProps {
  label: string;
  hint: string;
  htmlFor?: string;
}

export function InfoHint({ label, hint, htmlFor }: InfoHintProps) {
  const labelNode = htmlFor ? (
    <label htmlFor={htmlFor} className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
      {label}
    </label>
  ) : (
    <h4 className="text-sm font-semibold" style={{ color: "var(--forge-text-primary)" }}>
      {label}
    </h4>
  );

  return (
    <div className="flex items-center gap-2">
      {labelNode}
      <span
        aria-label={`${label} help`}
        title={hint}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold cursor-help"
        style={{
          border: "1px solid var(--forge-border-medium)",
          color: "var(--forge-text-muted)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        i
      </span>
    </div>
  );
}
