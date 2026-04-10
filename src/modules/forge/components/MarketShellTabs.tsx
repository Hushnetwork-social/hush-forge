"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFactoryAdminAccess } from "@/modules/forge/hooks/useFactoryAdminAccess";
import { useWalletStore } from "@/modules/forge/wallet-store";

const BASE_TABS = [
  { href: "/markets", label: "Pairs" },
  { href: "/tokens", label: "Tokens" },
] as const;

export function MarketShellTabs() {
  const pathname = usePathname();
  const address = useWalletStore((s) => s.address);
  const adminAccess = useFactoryAdminAccess(address);
  const tabs = adminAccess.access.navVisible
    ? [...BASE_TABS, { href: "/admin/factory", label: "Admin" as const }]
    : BASE_TABS;

  return (
    <nav aria-label="Market sections" className="flex items-center gap-2 flex-wrap">
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.href ||
          (tab.href === "/markets" && pathname.startsWith("/markets/")) ||
          (tab.href === "/tokens" && pathname.startsWith("/tokens/")) ||
          (tab.href === "/admin/factory" && pathname.startsWith("/admin/"));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: isActive
                ? "rgba(255,107,53,0.16)"
                : "rgba(255,255,255,0.03)",
              color: isActive
                ? "var(--forge-color-primary)"
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
