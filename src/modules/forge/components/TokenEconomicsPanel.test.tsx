import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TokenEconomicsPanel } from "./TokenEconomicsPanel";

describe("TokenEconomicsPanel", () => {
  it("renders all economics rows including explicit zero values", () => {
    render(
      <TokenEconomicsPanel
        economics={{
          burnRateBps: 0,
          burnRateDisplay: "0.00%",
          creatorFeeDatoshi: 0n,
          creatorFeeDisplay: "0 GAS",
          platformFeeDatoshi: 0n,
          platformFeeDisplay: "0 GAS",
          networkFeeDisclaimer:
            "Network GAS fees are charged separately by the Neo chain and are not part of token taxes.",
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Token Economics" })
    ).toBeInTheDocument();
    expect(screen.getByText("Burn Rate")).toBeInTheDocument();
    expect(screen.getByText("Creator Fee")).toBeInTheDocument();
    expect(screen.getByText("Platform Fee")).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getAllByText("0 GAS")).toHaveLength(2);
    expect(
      screen.getByText(
        "Network GAS fees are charged separately by the Neo chain and are not part of token taxes."
      )
    ).toBeInTheDocument();
  });
});
