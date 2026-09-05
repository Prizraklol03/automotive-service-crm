import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "@/shared/config/env";

describe("resolveApiBaseUrl", () => {
  it("keeps relative api base url unchanged", () => {
    expect(resolveApiBaseUrl("/api/")).toBe("/api");
  });

  it("falls back to same-origin api when loopback hosts differ", () => {
    expect(resolveApiBaseUrl("http://127.0.0.1:8000/api", "localhost")).toBe("/api");
  });

  it("keeps absolute api base url when loopback host matches current page", () => {
    expect(resolveApiBaseUrl("http://127.0.0.1:8000/api/", "127.0.0.1")).toBe("http://127.0.0.1:8000/api");
  });
});
