"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FACTORY_HASH_STORAGE_KEY,
  FACTORY_HASH_UPDATED_EVENT,
  getRuntimeFactoryHash,
} from "../forge-config";
import { getFactoryAdminAccess } from "../factory-governance-logic";
import { fetchFactoryConfig } from "../factory-governance-service";
import type { FactoryAdminAccess, FactoryConfig } from "../types";

export type FactoryAdminAccessStatus = "idle" | "loading" | "ready" | "error";

interface UseFactoryAdminAccessResult {
  factoryHash: string;
  status: FactoryAdminAccessStatus;
  config: FactoryConfig | null;
  error: string | null;
  access: FactoryAdminAccess;
  reload: () => void;
}

const EMPTY_ACCESS: FactoryAdminAccess = {
  connectedAddress: null,
  connectedHash: null,
  ownerHash: null,
  isOwner: false,
  navVisible: false,
  routeAuthorized: false,
};

export function useFactoryAdminAccess(
  connectedAddress: string | null
): UseFactoryAdminAccessResult {
  const [status, setStatus] = useState<FactoryAdminAccessStatus>("idle");
  const [config, setConfig] = useState<FactoryConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [factoryHash, setFactoryHash] = useState(() => getRuntimeFactoryHash());

  const access = useMemo(
    () => {
      const baseAccess = getFactoryAdminAccess(connectedAddress, config?.owner ?? null);
      const isActivated = Boolean(
        config?.templateNefStored && config?.templateManifestStored
      );

      return {
        ...baseAccess,
        navVisible: baseAccess.isOwner && isActivated,
      };
    },
    [
      connectedAddress,
      config?.owner,
      config?.templateManifestStored,
      config?.templateNefStored,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFactoryHash = () => {
      setFactoryHash(getRuntimeFactoryHash());
    };

    const refreshFromFactoryUpdate = () => {
      syncFactoryHash();
      setReloadToken((current) => current + 1);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FACTORY_HASH_STORAGE_KEY) {
        refreshFromFactoryUpdate();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(FACTORY_HASH_UPDATED_EVENT, refreshFromFactoryUpdate);
    syncFactoryHash();

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(FACTORY_HASH_UPDATED_EVENT, refreshFromFactoryUpdate);
    };
  }, []);

  useEffect(() => {
    if (!connectedAddress || !factoryHash) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      setStatus("loading");
      setError(null);

      void fetchFactoryConfig(factoryHash)
        .then((nextConfig) => {
          if (cancelled) return;
          setConfig(nextConfig);
          setStatus("ready");
        })
        .catch((err) => {
          if (cancelled) return;
          setConfig(null);
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress, factoryHash, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return {
    factoryHash,
    status: !connectedAddress ? "idle" : !factoryHash ? "error" : status,
    config: connectedAddress && factoryHash ? config : null,
    error: !connectedAddress ? null : !factoryHash ? "Factory contract hash is not configured." : error,
    access: connectedAddress ? access : { ...EMPTY_ACCESS, connectedAddress },
    reload,
  };
}
