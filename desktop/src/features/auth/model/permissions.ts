import type { ReactNode } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";
import type { PermissionCode } from "@/entities/user/model/permissions";
import { canPermission } from "@/entities/user/model/permissions";

export function usePermissions() {
  return useAuthStore((state) => state.user?.permissions ?? []);
}

export function useCan(permissionCode: PermissionCode) {
  return useAuthStore((state) => canPermission(state.user, permissionCode));
}

export function PermissionGate({
  children,
  fallback = null,
  permissionCode
}: {
  children: ReactNode;
  fallback?: ReactNode;
  permissionCode: PermissionCode;
}) {
  const allowed = useCan(permissionCode);
  return allowed ? children : fallback;
}
