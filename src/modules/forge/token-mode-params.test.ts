import { describe, expect, it } from "vitest";
import { serializeChangeModeParams } from "./token-mode-params";

describe("serializeChangeModeParams", () => {
  it("serializes speculation mode as quote asset plus integer curve inventory", () => {
    expect(serializeChangeModeParams("speculation", ["GAS", "700000"])).toEqual([
      { type: "String", value: "GAS" },
      { type: "Integer", value: "700000" },
    ]);
  });

  it("keeps non-speculation mode params as strings", () => {
    expect(serializeChangeModeParams("community", ["foo", 42])).toEqual([
      { type: "String", value: "foo" },
      { type: "String", value: "42" },
    ]);
  });
});
