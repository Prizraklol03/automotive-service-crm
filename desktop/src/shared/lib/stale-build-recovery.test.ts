import { describe, expect, it, vi } from "vitest";

import { getCurrentBuildId, isStaleBuildError, recoverFromStaleBuildError } from "./stale-build-recovery";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("stale build recovery", () => {
  it("recognizes Vite module failures but ignores ordinary runtime errors", () => {
    expect(isStaleBuildError(new Error("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isStaleBuildError(new Error("'text/html' is not a valid JavaScript MIME type"))).toBe(true);
    expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("reloads at most once for the same entry asset", () => {
    const reload = vi.fn();
    const storage = createStorage();
    const attempt = {
      buildId: "https://crm.example.invalid/assets/index-current.js",
      error: new Error("Loading chunk 42 failed"),
      reload,
      storage
    };

    expect(recoverFromStaleBuildError(attempt)).toBe(true);
    expect(recoverFromStaleBuildError(attempt)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for an ordinary runtime error", () => {
    const reload = vi.fn();

    expect(
      recoverFromStaleBuildError({
        buildId: "https://crm.example.invalid/assets/index-current.js",
        error: new Error("Cannot read properties of undefined"),
        reload,
        storage: createStorage()
      })
    ).toBe(false);

    expect(reload).not.toHaveBeenCalled();
  });

  it("uses the current module entry URL as the recovery boundary", () => {
    document.head.innerHTML = '<script type="module" src="/assets/index-current.js"></script>';

    expect(getCurrentBuildId(document)).toBe("http://localhost:3000/assets/index-current.js");
  });
});
