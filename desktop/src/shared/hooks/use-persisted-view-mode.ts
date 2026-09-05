import { useCallback, useEffect, useState } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";

export type ListViewMode = "cards" | "rows";

const STORAGE_VERSION = "2026-05-14";
const SYNC_EVENT = "crm:preferences-changed";

function getScopedStorageKey(baseKey: string, userId: number | null | undefined) {
  return `${baseKey}:${userId ?? "anonymous"}`;
}

function getScopedVersionKey(baseKey: string, userId: number | null | undefined) {
  return `${baseKey}.version:${userId ?? "anonymous"}`;
}

function readStoredMode(baseKey: string, userId: number | null | undefined, defaultMode: ListViewMode): ListViewMode {
  try {
    const storageKey = getScopedStorageKey(baseKey, userId);
    const versionKey = getScopedVersionKey(baseKey, userId);
    const raw = localStorage.getItem(storageKey);
    const version = localStorage.getItem(versionKey);

    if (version !== STORAGE_VERSION) {
      return defaultMode;
    }

    if (raw === "rows" || raw === "cards") {
      return raw;
    }

    return defaultMode;
  } catch {
    return defaultMode;
  }
}

export function usePersistedViewMode(baseKey: string, defaultMode: ListViewMode) {
  const userId = useAuthStore((state) => state.user?.id);
  const [mode, setMode] = useState<ListViewMode>(() => readStoredMode(baseKey, userId, defaultMode));

  useEffect(() => {
    setMode(readStoredMode(baseKey, userId, defaultMode));
  }, [baseKey, defaultMode, userId]);

  useEffect(() => {
    const storageKey = getScopedStorageKey(baseKey, userId);
    const sync = () => setMode(readStoredMode(baseKey, userId, defaultMode));
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
  }, [baseKey, defaultMode, userId]);

  const updateMode = useCallback(
    (nextMode: ListViewMode) => {
      const storageKey = getScopedStorageKey(baseKey, userId);
      const versionKey = getScopedVersionKey(baseKey, userId);
      setMode(nextMode);
      try {
        localStorage.setItem(storageKey, nextMode);
        localStorage.setItem(versionKey, STORAGE_VERSION);
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: storageKey }));
      } catch {
        // ignore storage failures
      }
    },
    [baseKey, userId]
  );

  return { mode, setMode: updateMode };
}
