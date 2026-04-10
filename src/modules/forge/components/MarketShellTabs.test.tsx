import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketShellTabs } from "./MarketShellTabs";
import { useFactoryAdminAccess } from "@/modules/forge/hooks/useFactoryAdminAccess";
import { useWalletStore } from "@/modules/forge/wallet-store";
import type { WalletStore } from "@/modules/forge/wallet-store";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/markets"),
}));

vi.mock("@/modules/forge/hooks/useFactoryAdminAccess", () => ({
  useFactoryAdminAccess: vi.fn(),
}));

vi.mock("@/modules/forge/wallet-store", () => ({
  useWalletStore: vi.fn(),
}));

import { usePathname } from "next/navigation";

function mockWallet(address: string | null) {
  vi.mocked(useWalletStore).mockImplementation(
    (selector: (s: WalletStore) => unknown) =>
      selector({ address } as WalletStore)
  );
}

describe("MarketShellTabs", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/markets");
    mockWallet(null);
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      factoryHash: "0xfactory",
      status: "ready",
      config: null,
      error: null,
      access: {
        connectedAddress: null,
        connectedHash: null,
        ownerHash: null,
        isOwner: false,
        navVisible: false,
        routeAuthorized: false,
      },
      reload: vi.fn(),
    });
  });

  it("shows pairs and tokens by default", () => {
    render(<MarketShellTabs />);

    expect(screen.getByRole("link", { name: "Pairs" })).toHaveAttribute("href", "/markets");
    expect(screen.getByRole("link", { name: "Tokens" })).toHaveAttribute("href", "/tokens");
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("shows admin inside the shared menu for the TokenFactory owner", () => {
    mockWallet("Nowner");
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      factoryHash: "0xfactory",
      status: "ready",
      config: null,
      error: null,
      access: {
        connectedAddress: "Nowner",
        connectedHash: "0xowner",
        ownerHash: "0xowner",
        isOwner: true,
        navVisible: true,
        routeAuthorized: true,
      },
      reload: vi.fn(),
    });

    render(<MarketShellTabs />);

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin/factory"
    );
  });

  it("marks admin active on the admin route", () => {
    mockWallet("Nowner");
    vi.mocked(usePathname).mockReturnValue("/admin/factory");
    vi.mocked(useFactoryAdminAccess).mockReturnValue({
      factoryHash: "0xfactory",
      status: "ready",
      config: null,
      error: null,
      access: {
        connectedAddress: "Nowner",
        connectedHash: "0xowner",
        ownerHash: "0xowner",
        isOwner: true,
        navVisible: true,
        routeAuthorized: true,
      },
      reload: vi.fn(),
    });

    render(<MarketShellTabs />);

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
