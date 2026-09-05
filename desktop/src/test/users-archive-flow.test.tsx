import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersPage } from "@/pages/users-page";

const activeUsers = [
  { full_name: "Demo Customer 32", id: 1, is_active: true, login: "active", role_code: "standard_user" as const }
];
const archivedUsers = [
  { full_name: "Demo Customer 33", id: 2, is_active: false, login: "archived", role_code: "standard_user" as const }
];

vi.mock("@/features/auth/model/permissions", () => ({ useCan: () => true }));
vi.mock("@/shared/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("@/features/users/api/users-hooks", () => ({
  useUsersListQuery: (isActive?: boolean) => ({
    data: isActive ? activeUsers : archivedUsers,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  })
}));
vi.mock("@/features/users/ui/user-detail-panel", () => ({
  UserDetailPanel: () => <div />
}));

describe("users archive flow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("separates active users from the archive by default", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/users"]}>
          <UsersPage />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Demo Customer 32");
    expect(container.textContent).not.toContain("Demo Customer 33");

    const archiveTab = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Архив");
    await act(async () => {
      archiveTab?.click();
    });

    expect(container.textContent).toContain("Demo Customer 33");
    expect(container.textContent).not.toContain("Demo Customer 32");
    expect(container.textContent).toContain("В архиве");

    act(() => root.unmount());
    container.remove();
  });
});
