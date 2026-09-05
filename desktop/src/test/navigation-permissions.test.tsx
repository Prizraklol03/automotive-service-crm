import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermissionGuard } from "@/app/router/guards";
import { ClientsPage } from "@/pages/clients-page";
import { Sidebar } from "@/widgets/app-shell/sidebar";

const currentAuthState = {
  retryBootstrap: vi.fn(),
  status: "authenticated" as "authenticated" | "bootstrapping" | "error" | "idle" | "unauthenticated",
  user: {
    full_name: "Employee",
    id: 1,
    is_active: true,
    login: "employee",
    permissions: [] as string[],
    role_code: "standard_user" as const
  }
};

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: typeof currentAuthState) => unknown) => selector(currentAuthState)
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    Navigate: ({ to }: { to: string }) => <div>{to === "/forbidden" ? "Недостаточно прав" : to}</div>
  };
});

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useModulesQuery: () => ({
    data: {
      client_portal: false,
      customer_payer: false,
      kanban: false,
      labor_norms: false,
      maintenance_schedule: false,
      online_booking: false,
      photos: false,
      salary: false,
      scheduler: false,
      vin_catalog: false,
      warehouse: false
    }
  })
}));

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useClientsInfiniteQuery: () => ({
    data: {},
    hasNextPage: false,
    items: [],
    isError: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isLoading: false,
    loadedCount: 0,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    total: 0
  })
}));

vi.mock("@/shared/hooks/use-clients-view-mode", () => ({
  useClientsViewMode: () => ({ mode: "list" })
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/features/notifications/api/notifications-hooks", () => ({
  useNotificationsListQuery: () => ({ data: [] })
}));

describe("permission visibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    currentAuthState.user.permissions = [];
    currentAuthState.status = "authenticated";
  });

  it("hides unavailable sidebar entries for employees without view permissions", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <Sidebar
            user={{
              ...currentAuthState.user,
              permissions: []
            }}
          />
        </MemoryRouter>
      );
    });

    expect(container.textContent).not.toContain("Клиенты");
    expect(container.textContent).not.toContain("Аналитика");
    expect(container.textContent).not.toContain("Заказы");
    expect(container.textContent).toContain("Настройки");

    act(() => root.unmount());
    container.remove();
  });

  it("shows forbidden state when an unauthorized permission guard renders", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PermissionGuard permissionCode="clients.view" />);
    });

    expect(container.textContent).toContain("Недостаточно прав");

    act(() => root.unmount());
    container.remove();
  });

  it("hides the client create button when the employee lacks clients.create", async () => {
    currentAuthState.user.permissions = ["clients.view"];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ClientsPage />
        </MemoryRouter>
      );
    });

    expect(container.textContent).not.toContain("Новый клиент");
    expect(container.textContent).not.toContain("Создать клиента");

    act(() => root.unmount());
    container.remove();
  });
});
