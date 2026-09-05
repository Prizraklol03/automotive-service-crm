import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_PERMISSION_CODES } from "@/entities/user/model/permissions";
import { UserDetailPanel } from "@/features/users/ui/user-detail-panel";

const userDetailData = {
  full_name: "Test User",
  id: 3,
  is_active: true,
  login: "user-3",
  role_code: "standard_user" as const,
  role_id: 2,
  token_version: 1
};

const currentPermissions = ALL_PERMISSION_CODES.map((permissionCode) => ({
  is_allowed: permissionCode.startsWith("clients."),
  permission_code: permissionCode
}));

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

const createUserSpy = vi.fn();
const userUpdateSpy = vi.fn();
const resetPasswordSpy = vi.fn();
const permissionsUpdateSpy = vi.fn();
const setUserActiveSpy = vi.fn();
const activityRefetchSpy = vi.fn();
const userRefetchSpy = vi.fn();
const permissionsRefetchSpy = vi.fn();

const userActivityData = { activities: [] as { id: number }[] };
const userPermissionsData = { permissions: currentPermissions, user: userDetailData };

vi.mock("@/features/users/api/users-hooks", () => ({
  useCreateUserMutation: () => ({ isError: false, isPending: false, mutateAsync: createUserSpy }),
  useUserActivityQuery: () => ({ data: userActivityData, isError: false, isLoading: false, refetch: activityRefetchSpy }),
  useUserDetailQuery: () => ({ data: userDetailData, isError: false, isLoading: false, refetch: userRefetchSpy }),
  useUserPermissionsQuery: () => ({ data: userPermissionsData, isError: false, isLoading: false, refetch: permissionsRefetchSpy }),
  useResetUserPasswordMutation: () => ({ isError: false, isPending: false, mutateAsync: resetPasswordSpy }),
  useSetUserActiveMutation: () => ({ isError: false, isPending: false, mutateAsync: setUserActiveSpy }),
  useUpdateUserMutation: () => ({ isError: false, isPending: false, mutateAsync: userUpdateSpy }),
  useUpdateUserPermissionsMutation: () => ({ isError: false, isPending: false, mutateAsync: permissionsUpdateSpy })
}));

function mount(isMobile: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    async render() {
      await act(async () => {
        root.render(<UserDetailPanel userKey="3" isMobile={isMobile} onClose={vi.fn()} onCreated={vi.fn()} />);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  userDetailData.is_active = true;
  setUserActiveSpy.mockClear();
});

describe("user detail panel layout", () => {
  it("shows user data fields alongside permission switches, not just permissions", async () => {
    const { container, render, unmount } = mount(false);
    await render();

    const fullNameInput = document.body.querySelector("input[name='full_name']") as HTMLInputElement | null;
    const loginInput = document.body.querySelector("input[name='login']") as HTMLInputElement | null;
    expect(fullNameInput?.value).toBe("Test User");
    expect(loginInput?.value).toBe("user-3");
    expect(document.body.textContent).toContain("Активно");
    expect(document.body.textContent).toContain("Пользователь");

    const switches = document.body.querySelectorAll('[role="switch"]');
    expect(switches.length).toBe(ALL_PERMISSION_CODES.length);

    unmount();
    void container;
  });

  it("keeps user fields and the full permissions list inside a single scroll container", async () => {
    const { render, unmount } = mount(false);
    await render();

    const fullNameInput = document.body.querySelector("input[name='full_name']") as HTMLInputElement | null;
    const lastSwitch = document.body.querySelectorAll('[role="switch"]');
    const lastPermissionSwitch = lastSwitch[lastSwitch.length - 1];

    const scrollContainer = fullNameInput?.closest(".overflow-y-auto");
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.contains(lastPermissionSwitch)).toBe(true);

    const saveButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Сохранить пользователя")
    );
    expect(scrollContainer?.contains(saveButton ?? null)).toBe(false);

    unmount();
  });

  it("renders a translucent blurred desktop backdrop, not an opaque white wall", async () => {
    const { render, unmount } = mount(false);
    await render();

    const backdrop = document.body.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain("bg-black/35");
    expect(backdrop?.className).toContain("backdrop-blur");
    expect(backdrop?.className).toContain("dark:bg-black/60");
    expect(backdrop?.className).not.toContain("bg-white");
    expect(backdrop?.className).not.toContain("bg-background");

    // MobileSheet's full-viewport ".mobile-sheet-frame" wrapper paints an opaque
    // bg-background over the whole screen, masking the backdrop blur behind a
    // centered panel. Desktop must not route through it.
    expect(document.body.querySelector(".mobile-sheet-frame")).toBeNull();

    unmount();
  });

  it("uses MobileSheet's translucent backdrop on mobile instead of a custom desktop backdrop", async () => {
    const { render, unmount } = mount(true);
    await render();

    const backdrop = document.body.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain("bg-black/35");
    expect(backdrop?.className).toContain("dark:bg-black/60");
    expect(document.body.querySelector(".mobile-sheet-frame")).not.toBeNull();

    unmount();
  });
  it("offers archive and restore actions for existing users", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { render, unmount } = mount(false);
    await render();
    const archiveButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Архивировать"));
    await act(async () => { archiveButton?.click(); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(setUserActiveSpy).toHaveBeenCalledWith({ isActive: false, userId: 3 });
    userDetailData.is_active = false;
    unmount();
    const restored = mount(false);
    await restored.render();
    expect(document.body.textContent).toContain("Восстановить");
    restored.unmount();
    confirmSpy.mockRestore();
  });
});
