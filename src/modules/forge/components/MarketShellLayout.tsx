"use client";

import type { FormEvent, ReactNode } from "react";
import { ForgeHeader } from "@/components/layout/ForgeHeader";
import { MarketShellTabs } from "./MarketShellTabs";

interface Props {
  onConnectClick: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  children: ReactNode;
}

export function MarketShellLayout({
  onConnectClick,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  children,
}: Props) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.();
  }

  return (
    <>
      <ForgeHeader onConnectClick={onConnectClick}>
        <div className="flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <input
                type="search"
                aria-label="Search markets"
                placeholder="Search pair, symbol, token hash"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--forge-border-subtle)",
                  color: "var(--forge-text-primary)",
                }}
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{
                background: "rgba(255,107,53,0.14)",
                color: "var(--forge-color-primary)",
              }}
            >
              Search
            </button>
          </form>
          <MarketShellTabs />
        </div>
      </ForgeHeader>

      <main className="min-h-screen p-6" style={{ background: "var(--forge-bg-primary)" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </>
  );
}
