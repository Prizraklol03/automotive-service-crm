import { useAuthStore } from "@/features/auth/model/auth-store";
import { readAuthSession, writeAuthSession } from "@/shared/api/auth-storage";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

const authenticatedUser = {
  full_name: "Demo Customer 01",
  id: 7,
  is_active: true,
  login: "admin",
  role_code: "admin" as const
};

describe("auth store session actions", () => {
  it("logout calls backend and closes current session locally", async () => {
    writeAuthSession({
      accessToken: "access-token",
      deviceType: "web",
      expiresIn: 900,
      refreshAbsoluteExpiresAt: "2026-07-02T00:00:00Z",
      refreshExpiresAt: "2026-05-03T00:00:00Z",
      refreshToken: null,
      sessionId: 13,
      tokenType: "bearer"
    });
    useAuthStore.setState({ errorMessage: null, status: "authenticated", user: authenticatedUser });

    const fetchMock = vi.fn(async () => jsonResponse({ revoked_session_id: 13, revoked_sessions_count: 1, status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await useAuthStore.getState().logout();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
    expect(readAuthSession()).toBeNull();
  });

  it("logout-all calls backend and clears the current web session", async () => {
    writeAuthSession({
      accessToken: "access-token",
      deviceType: "web",
      expiresIn: 900,
      refreshAbsoluteExpiresAt: "2026-07-02T00:00:00Z",
      refreshExpiresAt: "2026-05-03T00:00:00Z",
      refreshToken: null,
      sessionId: 15,
      tokenType: "bearer"
    });
    useAuthStore.setState({ errorMessage: null, status: "authenticated", user: authenticatedUser });

    const fetchMock = vi.fn(async () => jsonResponse({ revoked_session_id: null, revoked_sessions_count: 3, status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await useAuthStore.getState().logoutAll();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout-all",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(readAuthSession()).toBeNull();
  });

  it("stores effective permissions from auth/me after login", async () => {
    useAuthStore.setState({ errorMessage: null, status: "idle", user: null });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          access_token: "access-token",
          device_type: "web",
          expires_in: 900,
          refresh_absolute_expires_at: "2026-07-02T00:00:00Z",
          refresh_expires_at: "2026-05-03T00:00:00Z",
          refresh_token: "refresh-token",
          session_id: 17,
          token_type: "bearer"
        });
      }

      if (url.endsWith("/auth/me")) {
        return jsonResponse({
          permissions: ["clients.view", "orders.view"],
          user: authenticatedUser
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await useAuthStore.getState().login({ login: "admin", password: "secret" });

    expect(useAuthStore.getState().user?.permissions).toEqual(["clients.view", "orders.view"]);
  });
});
