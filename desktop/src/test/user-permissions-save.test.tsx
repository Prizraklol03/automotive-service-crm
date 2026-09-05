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

let currentPermissions = ALL_PERMISSION_CODES.map((permissionCode) => ({
  is_allowed: permissionCode.startsWith("clients."),
  permission_code: permissionCode
}));

let userPermissionsQueryData = {
  permissions: currentPermissions,
  user: userDetailData
};

const userUpdateSpy = vi.fn(async () => userDetailData);
const permissionsUpdateSpy = vi.fn(async () => ({
  permissions: currentPermissions,
  user: userDetailData
}));

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

vi.mock("@/features/users/api/users-hooks", () => ({
  useCreateUserMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUserActivityQuery: () => ({ data: { activities: [] }, isError: false, isLoading: false, refetch: vi.fn() }),
  useUserDetailQuery: () => ({ data: userDetailData, isError: false, isLoading: false, refetch: vi.fn() }),
  useUserPermissionsQuery: () => ({ data: userPermissionsQueryData, isError: false, isLoading: false, refetch: vi.fn() }),
  useResetUserPasswordMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useSetUserActiveMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUpdateUserMutation: () => ({ isError: false, isPending: false, mutateAsync: userUpdateSpy }),
  useUpdateUserPermissionsMutation: () => ({ isError: false, isPending: false, mutateAsync: permissionsUpdateSpy })
}));

describe("user permissions save", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    userUpdateSpy.mockClear();
    permissionsUpdateSpy.mockClear();
    currentPermissions = ALL_PERMISSION_CODES.map((permissionCode) => ({
      is_allowed: permissionCode.startsWith("clients."),
      permission_code: permissionCode
    }));
    userPermissionsQueryData = {
      permissions: currentPermissions,
      user: userDetailData
    };
  });

  it("persists permission switch changes when saving a user", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<UserDetailPanel userKey="3" isMobile={false} onClose={() => undefined} onCreated={() => undefined} />);
    });

    const switches = Array.from(document.body.querySelectorAll('[role="switch"]')) as HTMLButtonElement[];
    expect(switches).toHaveLength(ALL_PERMISSION_CODES.length);

    await act(async () => {
      switches[0]?.click();
      switches[1]?.click();
      switches[2]?.click();
    });

    const saveButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Сохранить пользователя")
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.click();
    });

    expect(userUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        payload: expect.objectContaining({
          full_name: "Test User",
          login: "user-3"
        })
      })
    );

    expect(permissionsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        payload: expect.objectContaining({
          permissions: expect.arrayContaining([
            expect.objectContaining({ permission_code: "personal_data.view", is_allowed: true }),
            expect.objectContaining({ permission_code: "personal_data.edit", is_allowed: true }),
            expect.objectContaining({ permission_code: "personal_data.export", is_allowed: true })
          ])
        })
      })
    );

    act(() => root.unmount());
    container.remove();
  });
});
