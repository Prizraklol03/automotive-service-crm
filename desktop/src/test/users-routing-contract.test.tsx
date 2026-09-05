import { act } from "react";
import { createRoot } from "react-dom/client";
import { matchRoutes, MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { navigationItems } from "@/app/config/navigation";
import { router } from "@/app/router/router";
import { mapFormValuesToUserPayload } from "@/features/users/model/user-form";
import { UsersPage } from "@/pages/users-page";

const usersList = [
  {
    full_name: "Test User",
    id: 3,
    is_active: true,
    login: "test-user",
    role_code: "standard_user" as const
  }
];

const userDetailPanelSpy = vi.fn();

vi.mock("@/features/auth/model/permissions", () => ({
  useCan: () => true
}));

vi.mock("@/features/users/api/users-hooks", () => ({
  useUsersListQuery: () => ({
    data: usersList,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  })
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/features/users/ui/user-detail-panel", () => ({
  UserDetailPanel: (props: {
    onClose: () => void;
    onCreated: (userId: number) => void;
    userKey: string | null;
  }) => {
    userDetailPanelSpy(props);
    return (
      <section aria-label="user detail panel">
        <div>Пользователь {props.userKey}</div>
        <button type="button" onClick={props.onClose}>
          close user
        </button>
        <button type="button" onClick={() => props.onCreated(7)}>
          created user
        </button>
      </section>
    );
  }
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function mountUsersPage(initialEntry: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    async render() {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={[initialEntry]}>
            <UsersPage />
            <LocationProbe />
          </MemoryRouter>
        );
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

describe("users routing contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    userDetailPanelSpy.mockClear();
  });

  it("keeps /users as the guarded canonical users route and frees /employees", () => {
    const routes = router.routes;
    const usersMatches = matchRoutes(routes, "/users") ?? [];
    const employeesMatches = matchRoutes(routes, "/employees") ?? [];

    expect(usersMatches.some((match) => match.route.path === "/users")).toBe(true);
    expect(
      usersMatches.some((match) => String(match.route.element?.type?.name ?? "").includes("PermissionGuard"))
    ).toBe(true);
    expect(employeesMatches.some((match) => match.route.path === "/users")).toBe(false);
    expect(employeesMatches.some((match) => match.route.path === "/employees")).toBe(false);
  });

  it("uses users terminology in navigation", () => {
    const usersNavigationItem = navigationItems.find((item) => item.id === "users");

    expect(usersNavigationItem).toEqual(
      expect.objectContaining({
        label: "Пользователи",
        permission: "settings.users.manage",
        to: "/users"
      })
    );
  });

  it("opens and closes the detail panel with only the ?user= query parameter", async () => {
    const { container, render, unmount } = mountUsersPage("/users?user=3");
    await render();

    expect(container.textContent).toContain("Пользователи");
    expect(container.textContent).toContain("Пользователь 3");
    expect(userDetailPanelSpy).toHaveBeenLastCalledWith(expect.objectContaining({ userKey: "3" }));

    const closeButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "close user");
    await act(async () => {
      closeButton?.click();
    });

    expect(container.querySelector("[data-testid='location']")?.textContent).toBe("/users");

    unmount();
  });

  it("ignores legacy ?employee= and normalizes navigation to ?user=", async () => {
    const { container, render, unmount } = mountUsersPage("/users?employee=3");
    await render();

    expect(container.textContent).not.toContain("Пользователь 3");
    expect(userDetailPanelSpy).not.toHaveBeenCalled();

    const listButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Test User")
    );
    await act(async () => {
      listButton?.click();
    });

    expect(container.querySelector("[data-testid='location']")?.textContent).toBe("/users?user=3");
    expect(userDetailPanelSpy).toHaveBeenLastCalledWith(expect.objectContaining({ userKey: "3" }));

    const createdButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "created user");
    await act(async () => {
      createdButton?.click();
    });

    expect(container.querySelector("[data-testid='location']")?.textContent).toBe("/users?user=7");

    unmount();
  });

  it("uses the standard_user role payload for a non-admin account", () => {
    expect(
      mapFormValuesToUserPayload({
        full_name: "Demo Customer 34",
        login: "new-user",
        password: "secret"
      })
    ).toEqual({
      full_name: "Demo Customer 34",
      is_active: true,
      login: "new-user",
      password: "secret",
      role_code: "standard_user"
    });
  });
});
