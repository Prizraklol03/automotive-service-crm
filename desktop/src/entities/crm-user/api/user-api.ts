import type { User, UserActivityFeed, UserPayload, UserUpdatePayload } from "@/entities/crm-user/model/types";
import type { PermissionCode } from "@/entities/user/model/permissions";
import { apiRequest } from "@/shared/api/client";

export type UserPermissionState = {
  is_allowed: boolean;
  permission_code: PermissionCode;
};

export type UserPermissionsResponse = {
  permissions: UserPermissionState[];
  user: User;
};

export type UserPermissionsUpdatePayload = {
  permissions: UserPermissionState[];
};

export function listUsersRequest(isActive?: boolean) {
  const query = isActive === undefined ? "" : `?is_active=${isActive}`;
  return apiRequest<User[]>(`/users${query}`);
}

export function getUserRequest(userId: number) {
  return apiRequest<User>(`/users/${userId}`);
}

export function createUserRequest(payload: UserPayload) {
  return apiRequest<User>("/users", {
    method: "POST",
    body: payload
  });
}

export function updateUserRequest(userId: number, payload: UserUpdatePayload) {
  return apiRequest<User>(`/users/${userId}`, {
    method: "PUT",
    body: payload
  });
}

export function resetUserPasswordRequest(userId: number, newPassword: string) {
  return apiRequest<User>(`/users/${userId}/reset-password`, {
    method: "PATCH",
    body: { new_password: newPassword }
  });
}

export function setUserActiveRequest(userId: number, isActive: boolean) {
  return apiRequest<User>(`/users/${userId}/active`, {
    method: "PATCH",
    body: { is_active: isActive }
  });
}

export function getUserActivityRequest(userId: number) {
  return apiRequest<UserActivityFeed>(`/users/${userId}/activity`);
}

export function getUserPermissionsRequest(userId: number) {
  return apiRequest<UserPermissionsResponse>(`/users/${userId}/permissions`);
}

export function updateUserPermissionsRequest(userId: number, payload: UserPermissionsUpdatePayload) {
  return apiRequest<UserPermissionsResponse>(`/users/${userId}/permissions`, {
    method: "PATCH",
    body: payload
  });
}
