import { describe, expect, it } from "vitest";
import { serializeChangeModeParams } from "./token-mode-params";

describe("serializeChangeModeParams", () => {
  it("serializes speculation mode as quote asset, curve inventory, and launch profile", () => {
    expect(serializeChangeModeParams("speculation", ["GAS", "700000", "growth"])).toEqual([
      { type: "String", value: "GAS" },
      { type: "Integer", value: "700000" },
      { type: "String", value: "growth" },
    ]);
  });

  it("keeps non-speculation mode params as strings", () => {
    expect(serializeChangeModeParams("community", ["foo", 42])).toEqual([
      { type: "String", value: "foo" },
      { type: "String", value: "42" },
    ]);
  });
});
