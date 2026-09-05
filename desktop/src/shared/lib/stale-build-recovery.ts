const STALE_BUILD_RECOVERY_KEY = "crm:stale-build-recovery";

const STALE_BUILD_ERROR_PATTERNS = [
  /chunkloaderror/i,
  /failed to fetch dynamically imported module/i,
  /failed to load module script/i,
  /importing a module script failed/i,
  /is not a valid javascript mime type/i,
  /loading chunk \d+ failed/i
];

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "";
}

export function isStaleBuildError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return STALE_BUILD_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function getCurrentBuildId(document: Document): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null;
}

export function recoverFromStaleBuildError({
  buildId,
  error,
  reload,
  storage
}: {
  buildId: string | null;
  error: unknown;
  reload: () => void;
  storage: SessionStorageLike;
}): boolean {
  if (!buildId || !isStaleBuildError(error)) {
    return false;
  }

  try {
    if (storage.getItem(STALE_BUILD_RECOVERY_KEY) === buildId) {
      return false;
    }

    storage.setItem(STALE_BUILD_RECOVERY_KEY, buildId);
    reload();
    return true;
  } catch {
    return false;
  }
}

export function installStaleBuildRecovery(target: Window = window): () => void {
  const buildId = getCurrentBuildId(target.document);
  const recover = (error: unknown) =>
    recoverFromStaleBuildError({
      buildId,
      error,
      reload: () => target.location.reload(),
      storage: target.sessionStorage
    });

  const onError = (event: ErrorEvent) => recover(event.error ?? event.message);
  const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event.reason);

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
