import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveFactoryHash } from "../forge-config";
import { useFactoryAdminAccess } from "./useFactoryAdminAccess";

vi.mock("../factory-governance-service", () => ({
  fetchFactoryConfig: vi.fn(),
}));

vi.mock("../neo-rpc-client", () => ({
  addressToHash160: vi.fn(),
}));

import { fetchFactoryConfig } from "../factory-governance-service";
import { addressToHash160 } from "../neo-rpc-client";

describe("useFactoryAdminAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();

    vi.mocked(addressToHash160).mockImplementation((address: string) => {
      if (address === "NOwnerWalletAddress") {
        return "0xowner";
      }
      return "0xother";
    });
  });

  it("reacts to a saved factory hash without remounting", async () => {
    vi.mocked(fetchFactoryConfig).mockResolvedValue({
      creationFee: 1n,
      operationFee: 2n,
      paused: false,
      owner: "0xowner",
      templateScriptHash: "0xtemplate",
      templateVersion: 1n,
      templateNefStored: true,
      templateManifestStored: true,
    });

    const { result } = renderHook(() => useFactoryAdminAccess("NOwnerWalletAddress"));

    expect(result.current.factoryHash).toBe("");
    expect(result.current.access.navVisible).toBe(false);

    await act(async () => {
      saveFactoryHash("0xfactory");
    });

    await waitFor(() => expect(result.current.factoryHash).toBe("0xfactory"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(fetchFactoryConfig).toHaveBeenCalledWith("0xfactory");
    expect(result.current.access.isOwner).toBe(true);
    expect(result.current.access.navVisible).toBe(true);
    expect(result.current.access.routeAuthorized).toBe(true);
  });
});
