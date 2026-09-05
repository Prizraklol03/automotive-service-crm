function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getCurrentHostname() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname;
}

function shouldUseRelativeApiBaseUrl(configuredBaseUrl: string, currentHostname = getCurrentHostname()) {
  if (!currentHostname) {
    return false;
  }

  if (!isLoopbackHostname(currentHostname)) {
    return false;
  }

  let configuredUrl: URL;
  try {
    configuredUrl = new URL(configuredBaseUrl);
  } catch {
    return false;
  }

  if (!isLoopbackHostname(configuredUrl.hostname)) {
    return false;
  }

  return configuredUrl.hostname !== currentHostname;
}

export function resolveApiBaseUrl(
  configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim(),
  currentHostname = getCurrentHostname()
) {
  if (configuredBaseUrl) {
    if (shouldUseRelativeApiBaseUrl(configuredBaseUrl, currentHostname)) {
      return "/api";
    }

    return normalizeBaseUrl(configuredBaseUrl);
  }

  return "/api";
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl()
};
