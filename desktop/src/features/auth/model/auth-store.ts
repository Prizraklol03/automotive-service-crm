import { create } from "zustand";
import type { StateCreator } from "zustand";

import type { CurrentUser } from "@/entities/user/model/types";
import {
  getCurrentUserRequest,
  type LoginPayload,
  loginRequest,
  logoutAllRequest,
  logoutRequest,
  refreshSessionRequest
} from "@/features/auth/api/auth-api";
import { clearAuthSession, readAuthSession } from "@/shared/api/auth-storage";
import { ApiError, setUnauthorizedHandler } from "@/shared/api/client";

type AuthStatus = "idle" | "bootstrapping" | "authenticated" | "unauthenticated" | "error";

type AuthStore = {
  bootstrapSession: () => Promise<void>;
  errorMessage: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  resetAuthState: () => void;
  retryBootstrap: () => Promise<void>;
  status: AuthStatus;
  user: CurrentUser | null;
};

let bootstrapPromise: Promise<void> | null = null;

async function restoreSession() {
  const session = await refreshSessionRequest();
  if (!session) {
    return null;
  }

  const envelope = await getCurrentUserRequest();
  return {
    session,
    user: {
      ...envelope.user,
      permissions: envelope.permissions
    }
  };
}

function buildUnauthenticatedState(message: string | null = null) {
  return {
    errorMessage: message,
    status: "unauthenticated" as const,
    user: null
  };
}

const createAuthStore: StateCreator<AuthStore> = (set, get) => ({
  async bootstrapSession() {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    const currentState = get();
    if (currentState.status === "authenticated" && currentState.user && readAuthSession()) {
      return;
    }

    set((state) => ({
      errorMessage: null,
      status: "bootstrapping",
      user: state.status === "authenticated" ? state.user : null
    }));

    bootstrapPromise = (async () => {
      try {
        const restored = await restoreSession();
        if (!restored) {
          clearAuthSession();
          set(buildUnauthenticatedState());
          return;
        }

        set({ errorMessage: null, status: "authenticated", user: restored.user });
      } catch (error) {
        clearAuthSession();
        if (error instanceof ApiError && error.status === 401) {
          set(buildUnauthenticatedState());
          return;
        }

        const message = error instanceof Error ? error.message : "Не удалось восстановить сессию";
        set({ errorMessage: message, status: "error", user: null });
      }
    })().finally(() => {
      bootstrapPromise = null;
    });

    return bootstrapPromise;
  },
  errorMessage: null,
  async login(payload) {
    set({ errorMessage: null, status: "bootstrapping" });

    try {
      await loginRequest(payload);
      const envelope = await getCurrentUserRequest();
      set({
        errorMessage: null,
        status: "authenticated",
        user: {
          ...envelope.user,
          permissions: envelope.permissions
        }
      });
    } catch (error) {
      clearAuthSession();
      const message = error instanceof Error ? error.message : "Не удалось выполнить вход";
      set({ errorMessage: message, status: "unauthenticated", user: null });
      throw error;
    }
  },
  async logout() {
    try {
      await logoutRequest();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    } finally {
      get().resetAuthState();
    }
  },
  async logoutAll() {
    try {
      await logoutAllRequest();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    } finally {
      get().resetAuthState();
    }
  },
  resetAuthState() {
    clearAuthSession();
    set(buildUnauthenticatedState());
  },
  async retryBootstrap() {
    await get().bootstrapSession();
  },
  status: "idle",
  user: null
});

export const useAuthStore = create<AuthStore>()(createAuthStore);

setUnauthorizedHandler(() => {
  useAuthStore.getState().resetAuthState();
});
