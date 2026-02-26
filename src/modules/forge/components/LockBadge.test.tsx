import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LockBadge } from "./LockBadge";

describe("LockBadge", () => {
  it("renders when locked", () => {
    render(<LockBadge locked={true} />);
    expect(screen.getByText("?? Immutable")).toBeInTheDocument();
  });

  it("renders nothing when unlocked", () => {
    const { container } = render(<LockBadge locked={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});