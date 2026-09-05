import { setUnauthorizedHandler, apiRequest, storeAuthSession } from "@/shared/api/client";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

describe("api client auth retry", () => {
  it("retries once after 401 and then succeeds", async () => {
    storeAuthSession({
      access_token: "stale-token",
      device_type: "web",
      expires_in: 900,
      refresh_absolute_expires_at: "2026-07-02T00:00:00Z",
      refresh_expires_at: "2026-05-03T00:00:00Z",
      refresh_token: null,
      session_id: 1,
      token_type: "bearer"
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Unauthorized" } }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "fresh-token",
          device_type: "web",
          expires_in: 900,
          refresh_absolute_expires_at: "2026-07-02T00:00:00Z",
          refresh_expires_at: "2026-05-03T00:00:00Z",
          refresh_token: null,
          session_id: 2,
          token_type: "bearer"
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ ok: boolean }>("/clients");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
  });

  it("does not loop endlessly when refresh fails", async () => {
    storeAuthSession({
      access_token: "stale-token",
      device_type: "web",
      expires_in: 900,
      refresh_absolute_expires_at: "2026-07-02T00:00:00Z",
      refresh_expires_at: "2026-05-03T00:00:00Z",
      refresh_token: null,
      session_id: 1,
      token_type: "bearer"
    });

    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Unauthorized" } }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Refresh failed" } }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/clients")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/clients");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
    expect(unauthorizedHandler).toHaveBeenCalled();
  });
});
