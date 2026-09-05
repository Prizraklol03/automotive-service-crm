import { useCallback, useEffect, useState } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";

const STORAGE_KEY = "crm.pref.categoryColors";
const STORAGE_VERSION_KEY = "crm.pref.categoryColors.version";
const STORAGE_VERSION = "2026-04-11";
const OLD_DEFAULT = true;
const NEW_DEFAULT = false;
const SYNC_EVENT = "crm:preferences-changed";

function getScopedStorageKey(userId: number | null | undefined) {
  return `${STORAGE_KEY}:${userId ?? "anonymous"}`;
}

function getScopedVersionKey(userId: number | null | undefined) {
  return `${STORAGE_VERSION_KEY}:${userId ?? "anonymous"}`;
}

function readStored(userId: number | null | undefined): boolean {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(userId));
    const version = localStorage.getItem(getScopedVersionKey(userId));
    if (version !== STORAGE_VERSION && (raw === null || raw === String(OLD_DEFAULT))) {
      return NEW_DEFAULT;
    }
    if (raw === null) return NEW_DEFAULT;
    return raw === "true";
  } catch {
    return NEW_DEFAULT;
  }
}

export function useColorPalette() {
  const userId = useAuthStore((state) => state.user?.id);
  const [enabled, setEnabled] = useState<boolean>(() => readStored(userId));

  useEffect(() => {
    setEnabled(readStored(userId));
  }, [userId]);

  useEffect(() => {
    const storageKey = getScopedStorageKey(userId);
    const sync = () => setEnabled(readStored(userId));
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

  const updateEnabled = useCallback((nextEnabled: boolean) => {
    const storageKey = getScopedStorageKey(userId);
    const versionKey = getScopedVersionKey(userId);
    setEnabled(nextEnabled);
    try {
      localStorage.setItem(storageKey, String(nextEnabled));
      localStorage.setItem(versionKey, STORAGE_VERSION);
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: storageKey }));
    } catch {
      // ignore
    }
  }, [userId]);

  const toggle = useCallback(() => updateEnabled(!readStored(userId)), [updateEnabled, userId]);

  return { enabled, toggle, setEnabled: updateEnabled };
}
