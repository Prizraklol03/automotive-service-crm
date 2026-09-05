import { clearAuthSession, readAuthSession, writeAuthSession } from "@/shared/api/auth-storage";
import { env } from "@/shared/config/env";
import type { ApiErrorPayload, ApiRequestOptions, AuthSession, DownloadResponse } from "@/shared/api/types";

type UnauthorizedHandler = () => void;

type TokenResponsePayload = {
  access_token: string;
  device_type: "web" | "mobile";
  expires_in: number;
  refresh_absolute_expires_at: string;
  refresh_expires_at: string;
  refresh_token: string | null;
  session_id: number;
  token_type: string;
};

let refreshRequest: Promise<AuthSession | null> | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export class ApiError extends Error {
  code?: string;
  details?: Record<string, unknown>;
  status: number;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}

function toAuthSession(payload: TokenResponsePayload): AuthSession {
  return {
    accessToken: payload.access_token,
    deviceType: payload.device_type,
    expiresIn: payload.expires_in,
    refreshAbsoluteExpiresAt: payload.refresh_absolute_expires_at,
    refreshExpiresAt: payload.refresh_expires_at,
    refreshToken: payload.refresh_token,
    sessionId: payload.session_id,
    tokenType: payload.token_type
  };
}

async function parseError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as ApiErrorPayload)
    : undefined;
  const fallbackMessage = response.status >= 500 ? "Ошибка сервера" : "Не удалось выполнить запрос";
  return new ApiError(payload?.error?.message ?? fallbackMessage, response.status, payload);
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      credentials: "include",
      ...init
    });
  } catch {
    throw new ApiError("Сервер недоступен", 0);
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

async function attemptRefresh(): Promise<AuthSession> {
  const payload = await requestJson<TokenResponsePayload>("/auth/refresh", {
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const nextSession = toAuthSession(payload);
  writeAuthSession(nextSession);
  return nextSession;
}

async function refreshTokens() {
  if (refreshRequest) {
    return refreshRequest;
  }

  refreshRequest = attemptRefresh()
    .catch(async (err) => {
      // Concurrent refresh from another tab: the cookie already carries the new token,
      // wait briefly and retry once before giving up.
      if (err instanceof ApiError && err.code === "refresh_concurrent") {
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
        return attemptRefresh();
      }
      throw err;
    })
    .catch(() => {
      clearAuthSession();
      unauthorizedHandler?.();
      return null;
    })
    .finally(() => {
      refreshRequest = null;
    });

  return refreshRequest;
}

function buildHeaders(options: ApiRequestOptions, accessToken?: string) {
  const headers = new Headers(options.headers);

  if (accessToken && !options.skipAuth) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function buildRequestInit(options: ApiRequestOptions, accessToken?: string): RequestInit {
  return {
    ...options,
    credentials: options.credentials ?? "include",
    headers: buildHeaders(options, accessToken),
    body:
      options.body && !(options.body instanceof FormData) && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : (options.body ?? undefined)
  };
}

function shouldTryRefresh(path: string, options: ApiRequestOptions, retried: boolean) {
  if (retried || options.skipAuth) {
    return false;
  }

  return path !== "/auth/login" && path !== "/auth/refresh";
}

async function executeRequest(path: string, options: ApiRequestOptions = {}, retried = false): Promise<Response> {
  const session = readAuthSession();
  const requestInit = buildRequestInit(options, session?.accessToken);

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, requestInit);
  } catch {
    throw new ApiError("Сервер недоступен", 0);
  }

  if (response.status === 401 && shouldTryRefresh(path, options, retried)) {
    const nextSession = await refreshTokens();
    if (nextSession) {
      return executeRequest(path, options, true);
    }
  }

  if (!response.ok) {
    const error = await parseError(response);
    if (error.status === 401) {
      clearAuthSession();
      unauthorizedHandler?.();
    }
    throw error;
  }

  return response;
}

function extractFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const asciiMatch = contentDisposition.match(/filename=\"?([^\"]+)\"?/i);
  return asciiMatch?.[1] ?? null;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;
}

export function storeAuthSession(payload: TokenResponsePayload) {
  const session = toAuthSession(payload);
  writeAuthSession(session);
  return session;
}

export async function refreshAuthSession() {
  return refreshTokens();
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}, retried = false): Promise<T> {
  const response = await executeRequest(path, options, retried);

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.blob()) as T;
}

export async function apiDownload(path: string, options: ApiRequestOptions = {}): Promise<DownloadResponse> {
  const response = await executeRequest(path, options);

  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type"),
    filename: extractFilename(response.headers.get("content-disposition"))
  };
}
