import { navigationItems } from "@/app/config/navigation";

describe("navigation access rules", () => {
  it("uses permission codes for sensitive navigation items", () => {
    expect(navigationItems.find((item) => item.id === "orders")?.permission).toBe("orders.view");
    expect(navigationItems.find((item) => item.id === "clients")?.permission).toBe("clients.view");
    expect(navigationItems.find((item) => item.id === "vehicles")?.permission).toBe("vehicles.view");
    expect(navigationItems.find((item) => item.id === "services")?.permission).toBe("settings.catalog.manage");
    expect(navigationItems.find((item) => item.id === "materials")?.permission).toBe("materials.view");
    expect(navigationItems.find((item) => item.id === "finance")?.permission).toBe("finance.view");
    expect(navigationItems.find((item) => item.id === "analytics")?.permission).toBe("analytics.view");
    expect(navigationItems.find((item) => item.id === "users")?.permission).toBe("settings.users.manage");
  });
});
