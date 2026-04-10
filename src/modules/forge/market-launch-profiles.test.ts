import { describe, expect, it } from "vitest";
import {
  deriveLaunchProfilePreview,
  getLaunchProfileDefinition,
  getRecommendedLaunchProfiles,
  normalizeLaunchProfileId,
} from "./market-launch-profiles";

describe("market-launch-profiles", () => {
  it("normalizes launch profile ids", () => {
    expect(normalizeLaunchProfileId("Starter")).toBe("starter");
    expect(normalizeLaunchProfileId("flagship")).toBe("flagship");
    expect(normalizeLaunchProfileId("unknown")).toBeNull();
  });

  it("derives bounded launch settings for a starter GAS curve", () => {
    const preview = deriveLaunchProfilePreview(
      "starter",
      "GAS",
      1_000_000n
    );

    expect(preview).not.toBeNull();
    expect(preview?.initialLaunchCap).toBe(60_000_000_000n);
    expect(preview?.graduationThreshold).toBe(200_000_000_000n);
    expect(preview?.virtualQuote).toBeGreaterThan(0n);
    expect(preview?.virtualTokens).toBeGreaterThan(0n);
    expect(preview?.initialPrice).toBeGreaterThan(0n);
  });

  it("keeps the implied launch cap aligned with the selected profile target", () => {
    const curveInventory = 100_000_000_000_000_000n;
    const preview = deriveLaunchProfilePreview(
      "growth",
      "GAS",
      curveInventory
    );

    expect(preview).not.toBeNull();

    const impliedLaunchCap =
      ((preview?.initialPrice ?? 0n) * curveInventory) /
      1_000_000_000_000_000_000n;

    expect(impliedLaunchCap).toBe(450_000_000_000n);
  });

  it("exposes the bounded profile recommendations by supply bucket", () => {
    expect(getRecommendedLaunchProfiles(1_000_000n)).toEqual(["starter", "standard"]);
    expect(getRecommendedLaunchProfiles(1_000_000_000n)[0]).toBe("growth");
    expect(getLaunchProfileDefinition("growth").label).toBe("Growth");
  });
});
