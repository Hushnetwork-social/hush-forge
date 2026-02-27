import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BurnBadge } from "./BurnBadge";

describe("BurnBadge", () => {
  it("renders formatted burn rate when > 0", () => {
    render(<BurnBadge burnRate={100} />);
    expect(screen.getByText("Burn 1.00%")).toBeInTheDocument();
  });

  it("renders nothing when burnRate is 0", () => {
    const { container } = render(<BurnBadge burnRate={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
