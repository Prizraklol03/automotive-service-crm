import { useCallback, useEffect, useState } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";

export type OrdersViewMode = "cards" | "rows";

const STORAGE_KEY = "crm.pref.ordersViewMode";
const STORAGE_VERSION_KEY = "crm.pref.ordersViewMode.version";
const STORAGE_VERSION = "2026-04-11";
const OLD_DEFAULT = "cards";
const NEW_DEFAULT: OrdersViewMode = "rows";
const SYNC_EVENT = "crm:preferences-changed";

function getScopedStorageKey(userId: number | null | undefined) {
  return `${STORAGE_KEY}:${userId ?? "anonymous"}`;
}

function getScopedVersionKey(userId: number | null | undefined) {
  return `${STORAGE_VERSION_KEY}:${userId ?? "anonymous"}`;
}

function readStored(userId: number | null | undefined): OrdersViewMode {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(userId));
    const version = localStorage.getItem(getScopedVersionKey(userId));
    if (version !== STORAGE_VERSION && (raw === null || raw === OLD_DEFAULT)) {
      return NEW_DEFAULT;
    }
    if (raw === "rows" || raw === "cards") {
      return raw;
    }
    return NEW_DEFAULT;
  } catch {
    return NEW_DEFAULT;
  }
}

export function useOrdersViewMode() {
  const userId = useAuthStore((state) => state.user?.id);
  const [mode, setMode] = useState<OrdersViewMode>(() => readStored(userId));

  useEffect(() => {
    setMode(readStored(userId));
  }, [userId]);

  useEffect(() => {
    const storageKey = getScopedStorageKey(userId);
    const sync = () => setMode(readStored(userId));
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

  const updateMode = useCallback((nextMode: OrdersViewMode) => {
    const storageKey = getScopedStorageKey(userId);
    const versionKey = getScopedVersionKey(userId);
    setMode(nextMode);
    try {
      localStorage.setItem(storageKey, nextMode);
      localStorage.setItem(versionKey, STORAGE_VERSION);
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: storageKey }));
    } catch {
      // ignore storage failures
    }
  }, [userId]);

  return { mode, setMode: updateMode };
}
