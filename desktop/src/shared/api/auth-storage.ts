import type { AuthSession } from "@/shared/api/types";

const STORAGE_KEY = "crm.v2.auth";
let authSession: AuthSession | null = null;

function clearLegacyBrowserStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage access errors in locked-down browser contexts.
  }
}

clearLegacyBrowserStorage();

export function readAuthSession(): AuthSession | null {
  return authSession;
}

export function writeAuthSession(nextSession: AuthSession) {
  authSession = nextSession;
}

export function clearAuthSession() {
  authSession = null;
  clearLegacyBrowserStorage();
}
