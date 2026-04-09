"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/markets", label: "Pairs" },
  { href: "/tokens", label: "Tokens" },
] as const;

export function MarketShellTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Market sections" className="flex items-center gap-2 flex-wrap">
      {TABS.map((tab) => {
        const isActive =
          pathname === tab.href ||
          (tab.href === "/markets" && pathname.startsWith("/markets/")) ||
          (tab.href === "/tokens" && pathname.startsWith("/tokens/"));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: isActive
                ? "var(--forge-color-primary)"
                : "rgba(255,255,255,0.04)",
              color: isActive
                ? "var(--forge-text-primary)"
                : "var(--forge-text-muted)",
              border: `1px solid ${
                isActive
                  ? "var(--forge-color-primary)"
                  : "var(--forge-border-subtle)"
              }`,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
