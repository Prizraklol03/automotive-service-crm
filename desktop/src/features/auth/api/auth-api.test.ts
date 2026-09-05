import { loginRequest, refreshSessionRequest } from "@/features/auth/api/auth-api";
import { readAuthSession } from "@/shared/api/auth-storage";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

describe("web auth api", () => {
  it("logs in without persisting refresh token in browser storage", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: "access-token",
        device_type: "web",
        expires_in: 900,
        refresh_absolute_expires_at: "2026-07-02T00:00:00Z",
        refresh_expires_at: "2026-05-03T00:00:00Z",
        refresh_token: null,
        session_id: 101,
        token_type: "bearer"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await loginRequest({ login: "admin", password: "secret" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(request.credentials).toBe("include");
    expect(request.method).toBe("POST");

    const payload = JSON.parse(String(request.body)) as Record<string, string>;
    expect(payload.login).toBe("admin");
    expect(payload.password).toBe("secret");
    expect(payload.device_type).toBe("web");
    expect(payload.device_name).toContain("Web browser");

    expect(window.localStorage.getItem("crm.v2.auth")).toBeNull();
    expect(window.sessionStorage.getItem("crm.v2.auth")).toBeNull();
    expect(readAuthSession()).toMatchObject({
      accessToken: "access-token",
      deviceType: "web",
      refreshToken: null,
      sessionId: 101
    });
  });

  it("refreshes web session through cookie flow without refresh token in request body", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: "next-access-token",
        device_type: "web",
        expires_in: 900,
        refresh_absolute_expires_at: "2026-07-02T00:00:00Z",
        refresh_expires_at: "2026-05-03T00:00:00Z",
        refresh_token: null,
        session_id: 202,
        token_type: "bearer"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await refreshSessionRequest();

    expect(session).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/refresh");
    expect(request.credentials).toBe("include");
    expect(request.method).toBe("POST");
    expect(request.body).toBeUndefined();
  });
});
