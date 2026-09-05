import { canPermission } from "@/entities/user/model/permissions";

describe("permission helper", () => {
  it("allows admin users regardless of explicit permission array", () => {
    expect(canPermission({ role_code: "admin", permissions: [] }, "analytics.view")).toBe(true);
  });

  it("uses the effective permission list for standard users", () => {
    expect(canPermission({ role_code: "standard_user", permissions: ["orders.view", "finance.view"] }, "finance.view")).toBe(true);
    expect(canPermission({ role_code: "standard_user", permissions: ["orders.view", "finance.view"] }, "analytics.view")).toBe(false);
  });
});
