import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import Home from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("redirects the root route to /markets", () => {
    Home();

    expect(redirectMock).toHaveBeenCalledWith("/markets");
  });
});
