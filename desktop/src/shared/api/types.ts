export type ApiErrorPayload = {
  error?: {
    code?: string;
    details?: Record<string, unknown>;
    message?: string;
  };
};

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null;
  skipAuth?: boolean;
};

export type DeviceType = "web" | "mobile";

export type AuthSession = {
  accessToken: string;
  deviceType: DeviceType;
  expiresIn: number;
  refreshAbsoluteExpiresAt: string;
  refreshExpiresAt: string;
  refreshToken?: string | null;
  sessionId: number;
  tokenType: string;
};

export type DownloadResponse = {
  blob: Blob;
  contentType: string | null;
  filename: string | null;
};
