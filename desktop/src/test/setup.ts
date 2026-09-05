import { afterEach, beforeEach, vi } from "vitest";

import { clearAuthSession } from "@/shared/api/auth-storage";
import { useAuthStore } from "@/features/auth/model/auth-store";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  clearAuthSession();
  useAuthStore.getState().resetAuthState();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
