import { useCallback, useEffect, useState } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";

export type OrderDetailVersion = "legacy" | "modern";

const STORAGE_KEY = "crm.pref.orderDetailVersion";
const STORAGE_VERSION_KEY = "crm.pref.orderDetailVersion.version";
const STORAGE_VERSION = "2026-04-11";
const OLD_DEFAULT = "modern";
const NEW_DEFAULT: OrderDetailVersion = "legacy";
const SYNC_EVENT = "crm:preferences-changed";

function getScopedStorageKey(userId: number | null | undefined) {
  return `${STORAGE_KEY}:${userId ?? "anonymous"}`;
}

function getScopedVersionKey(userId: number | null | undefined) {
  return `${STORAGE_VERSION_KEY}:${userId ?? "anonymous"}`;
}

function readStored(userId: number | null | undefined): OrderDetailVersion {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(userId));
    const version = localStorage.getItem(getScopedVersionKey(userId));
    if (version !== STORAGE_VERSION && (raw === null || raw === OLD_DEFAULT)) {
      return NEW_DEFAULT;
    }
    return raw === "legacy" ? "legacy" : "modern";
  } catch {
    return NEW_DEFAULT;
  }
}

export function useOrderDetailVersion() {
  const userId = useAuthStore((state) => state.user?.id);
  const [version, setVersion] = useState<OrderDetailVersion>(() => readStored(userId));

  useEffect(() => {
    setVersion(readStored(userId));
  }, [userId]);

  useEffect(() => {
    const storageKey = getScopedStorageKey(userId);
    const sync = () => setVersion(readStored(userId));
    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      if (!detail || detail === storageKey) {
        sync();
      }
    };

    window.addEventListener("storage", sync);
    window.addEventListener(SYNC_EVENT, handleCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SYNC_EVENT, handleCustomEvent as EventListener);
    };
  }, [userId]);

  const updateVersion = useCallback((nextVersion: OrderDetailVersion) => {
    const storageKey = getScopedStorageKey(userId);
    const versionKey = getScopedVersionKey(userId);
    setVersion(nextVersion);
    try {
      localStorage.setItem(storageKey, nextVersion);
      localStorage.setItem(versionKey, STORAGE_VERSION);
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: storageKey }));
    } catch {
      // ignore storage failures
    }
  }, [userId]);

  return { version, setVersion: updateVersion };
}
