interface BurnBadgeProps {
  burnRate: number;
}

export function BurnBadge({ burnRate }: BurnBadgeProps) {
  if (!burnRate || burnRate <= 0) return null;

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1"
      style={{ background: "rgba(255,140,0,0.15)", color: "#ff9600" }}
    >
      Burn {(burnRate / 100).toFixed(2)}%
    </span>
  );
}
