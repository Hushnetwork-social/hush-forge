interface LockBadgeProps {
  locked: boolean;
}

export function LockBadge({ locked }: LockBadgeProps) {
  if (!locked) return null;

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1"
      style={{ background: "rgba(0,140,255,0.15)", color: "#4fc3f7" }}
    >
      Locked (Immutable)
    </span>
  );
}
