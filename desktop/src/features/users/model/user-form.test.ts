import { describe, expect, it } from "vitest";

import { userFormSchema, mapFormValuesToUserPayload } from "./user-form";

const baseValues = {
  full_name: "Synthetic User",
  login: "synthetic.user"
};

describe("userFormSchema", () => {
  it("rejects short and known weak passwords", () => {
    expect(userFormSchema.safeParse({ ...baseValues, password: "short" }).success).toBe(false);
    expect(userFormSchema.safeParse({ ...baseValues, password: "password1234" }).success).toBe(false);
  });

  it("accepts a long passphrase", () => {
    expect(userFormSchema.safeParse({ ...baseValues, password: "A long synthetic passphrase 2026!" }).success).toBe(true);
  });

  it("uses the canonical standard_user role in create payloads", () => {
    const payload = mapFormValuesToUserPayload({
      ...baseValues,
      password: "A long synthetic passphrase 2026!"
    });

    expect(payload.role_code).toBe("standard_user");
  });
});
