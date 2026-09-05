import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createUserRequest,
  getUserActivityRequest,
  getUserPermissionsRequest,
  getUserRequest,
  listUsersRequest,
  resetUserPasswordRequest,
  setUserActiveRequest,
  updateUserPermissionsRequest,
  updateUserRequest
} from "@/entities/crm-user/api/user-api";
import type { UserPayload, UserUpdatePayload } from "@/entities/crm-user/model/types";
import type { UserPermissionsUpdatePayload } from "@/entities/crm-user/api/user-api";

export function usersListQueryKey(isActive?: boolean) {
  return ["users", "list", isActive ?? "all"] as const;}

export function userDetailQueryKey(userId: number) {
  return ["users", "detail", userId] as const;
}

export function userActivityQueryKey(userId: number) {
  return ["users", "activity", userId] as const;
}

export function userPermissionsQueryKey(userId: number) {
  return ["users", "permissions", userId] as const;
}

export function useUsersListQuery(isActive?: boolean) {
  return useQuery({
    queryKey: usersListQueryKey(isActive),
    queryFn: () => listUsersRequest(isActive)
  });
}

export function useUserDetailQuery(userId: number | null) {
  return useQuery({
    queryKey: userId ? userDetailQueryKey(userId) : ["users", "detail", "empty"],
    queryFn: () => getUserRequest(userId as number),
    enabled: userId !== null
  });
}

export function useUserActivityQuery(userId: number | null) {
  return useQuery({
    queryKey: userId ? userActivityQueryKey(userId) : ["users", "activity", "empty"],
    queryFn: () => getUserActivityRequest(userId as number),
    enabled: userId !== null
  });
}

export function useUserPermissionsQuery(userId: number | null) {
  return useQuery({
    queryKey: userId ? userPermissionsQueryKey(userId) : ["users", "permissions", "empty"],
    queryFn: () => getUserPermissionsRequest(userId as number),
    enabled: userId !== null
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UserPayload) => createUserRequest(payload),
    onSuccess: (user) => {
      queryClient.setQueryData(userDetailQueryKey(user.id), user);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "activity"] });
    }
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: UserUpdatePayload }) =>
      updateUserRequest(userId, payload),
    onSuccess: (user) => {
      queryClient.setQueryData(userDetailQueryKey(user.id), user);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "activity"] });
    }
  });
}

export function useResetUserPasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: number; newPassword: string }) =>
      resetUserPasswordRequest(userId, newPassword),
    onSuccess: (user) => {
      queryClient.setQueryData(userDetailQueryKey(user.id), user);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "activity"] });
    }
  });
}

export function useSetUserActiveMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) => setUserActiveRequest(userId, isActive),
    onSuccess: (user) => {
      queryClient.setQueryData(userDetailQueryKey(user.id), user);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "activity"] });
    }
  });
}

export function useUpdateUserPermissionsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: UserPermissionsUpdatePayload }) =>
      updateUserPermissionsRequest(userId, payload),
    onSuccess: (response) => {
      queryClient.setQueryData(userPermissionsQueryKey(response.user.id), response);
      queryClient.setQueryData(userDetailQueryKey(response.user.id), response.user);
      void queryClient.invalidateQueries({ queryKey: userPermissionsQueryKey(response.user.id) });
      void queryClient.invalidateQueries({ queryKey: userDetailQueryKey(response.user.id) });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });
}
