import { afterEach, describe, expect, it, vi } from "vitest";

describe("forge-config router hash runtime fallback", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("reads the BondingCurveRouter hash from localStorage when env is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_BONDING_CURVE_ROUTER_HASH", "");
    localStorage.setItem("forge_bonding_curve_router_hash", "0xrouter");

    const { getRuntimeBondingCurveRouterHash } = await import("./forge-config");

    expect(getRuntimeBondingCurveRouterHash()).toBe("0xrouter");
  });

  it("prefers the env router hash over localStorage", async () => {
    vi.stubEnv("NEXT_PUBLIC_BONDING_CURVE_ROUTER_HASH", "0xenvrouter");
    localStorage.setItem("forge_bonding_curve_router_hash", "0xrouter");

    const { getRuntimeBondingCurveRouterHash } = await import("./forge-config");

    expect(getRuntimeBondingCurveRouterHash()).toBe("0xenvrouter");
  });
});
