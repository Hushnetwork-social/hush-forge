"use client";

import type { ReactNode } from "react";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { MarketShellTabs } from "./MarketShellTabs";

interface Props {
  onConnectClick: () => void;
  children: ReactNode;
}

export function MarketShellLayout({ onConnectClick, children }: Props) {
  return (
    <>
      <ForgeHeader onConnectClick={onConnectClick}>
        <MarketShellTabs />
      </ForgeHeader>

      <main className="min-h-screen p-6" style={{ background: "var(--forge-bg-primary)" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </>
  );
}
