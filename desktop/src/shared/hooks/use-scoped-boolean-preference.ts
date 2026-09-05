import { useCallback, useEffect, useState } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";

const SYNC_EVENT = "crm:preferences-changed";

function getScopedStorageKey(storageKey: string, userId: number | null | undefined) {
  return `${storageKey}:${userId ?? "anonymous"}`;
}

function getScopedVersionKey(storageKey: string, userId: number | null | undefined) {
  return `${storageKey}.version:${userId ?? "anonymous"}`;
}

export function useScopedBooleanPreference(storageKey: string, defaultValue: boolean) {
  const userId = useAuthStore((state) => state.user?.id);
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(getScopedStorageKey(storageKey, userId));
      return raw === null ? defaultValue : raw === "true";
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getScopedStorageKey(storageKey, userId));
      setValue(raw === null ? defaultValue : raw === "true");
    } catch {
      setValue(defaultValue);
    }
  }, [defaultValue, storageKey, userId]);

  useEffect(() => {
    const scopedKey = getScopedStorageKey(storageKey, userId);
    const sync = () => {
      try {
        const raw = localStorage.getItem(scopedKey);
        setValue(raw === null ? defaultValue : raw === "true");
      } catch {
        setValue(defaultValue);
      }
    };

    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      if (!detail || detail === scopedKey) {
        sync();
      }
    };

    window.addEventListener("storage", sync);
    window.addEventListener(SYNC_EVENT, handleCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SYNC_EVENT, handleCustomEvent as EventListener);
    };
  }, [defaultValue, storageKey, userId]);

  const updateValue = useCallback(
    (nextValue: boolean) => {
      const scopedKey = getScopedStorageKey(storageKey, userId);
      const scopedVersionKey = getScopedVersionKey(storageKey, userId);
      setValue(nextValue);
      try {
        localStorage.setItem(scopedKey, String(nextValue));
        localStorage.setItem(scopedVersionKey, "1");
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: scopedKey }));
      } catch {
        // ignore storage failures
      }
    },
    [storageKey, userId]
  );

  return { value, setValue: updateValue };
}
