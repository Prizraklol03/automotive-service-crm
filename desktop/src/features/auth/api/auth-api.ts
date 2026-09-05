import { apiRequest, refreshAuthSession, storeAuthSession } from "@/shared/api/client";
import type { AuthSession, DeviceType } from "@/shared/api/types";
import type { CurrentUser } from "@/entities/user/model/types";
import type { PermissionCode } from "@/entities/user/model/permissions";

export type LoginPayload = {
  login: string;
  password: string;
};

export type AuthSessionInfo = {
  absolute_expires_at: string;
  created_at: string;
  device_name: string | null;
  device_type: DeviceType;
  expires_at: string;
  id: number;
  is_current: boolean;
  last_used_at: string;
};

type TokenResponse = {
  access_token: string;
  device_type: DeviceType;
  expires_in: number;
  refresh_absolute_expires_at: string;
  refresh_expires_at: string;
  refresh_token: string | null;
  session_id: number;
  token_type: string;
};

type SessionActionResponse = {
  revoked_session_id: number | null;
  revoked_sessions_count: number;
  status: string;
};

function resolveWebDeviceName() {
  if (typeof navigator === "undefined") {
    return "Web browser";
  }

  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "unknown platform";
  return `Web browser (${platform})`;
}

function toSession(tokens: TokenResponse): AuthSession {
  return storeAuthSession(tokens);
}

export async function loginRequest(payload: LoginPayload) {
  const response = await apiRequest<TokenResponse>("/auth/login", {
    body: {
      ...payload,
      device_name: resolveWebDeviceName(),
      device_type: "web"
    },
    method: "POST",
    skipAuth: true
  });

  return toSession(response);
}

export async function refreshSessionRequest() {
  const session = await refreshAuthSession();
  return session;
}

export function logoutRequest() {
  return apiRequest<SessionActionResponse>("/auth/logout", {
    method: "POST"
  });
}

export function logoutAllRequest() {
  return apiRequest<SessionActionResponse>("/auth/logout-all", {
    method: "POST"
  });
}

export function listSessionsRequest() {
  return apiRequest<AuthSessionInfo[]>("/auth/sessions");
}

export function revokeSessionRequest(sessionId: number) {
  return apiRequest<SessionActionResponse>(`/auth/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

export function getCurrentUserRequest() {
  return apiRequest<{ permissions: PermissionCode[]; user: CurrentUser }>("/auth/me");
}
