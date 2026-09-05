import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import type { RoleCode } from "@/entities/user/model/types";
import type { PermissionCode } from "@/entities/user/model/permissions";
import { canPermission } from "@/entities/user/model/permissions";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { BRAND_NAME } from "@/shared/config/brand";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";

function FullscreenState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export function ProtectedRoute() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const retryBootstrap = useAuthStore((state) => state.retryBootstrap);

  if (status === "idle" || status === "bootstrapping") {
    return (
      <FullscreenState>
        <LoadingState title={`Подключаем ${BRAND_NAME}`} description="Восстанавливаем сессию и готовим рабочее пространство." compact />
      </FullscreenState>
    );
  }

  if (status === "error") {
    return (
      <FullscreenState>
        <ErrorState
          title={`${BRAND_NAME} временно недоступна`}
          description="Не удалось подтвердить сессию. Проверьте подключение и попробуйте снова."
          actionLabel="Повторить"
          onAction={() => void retryBootstrap()}
        />
      </FullscreenState>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const nextPath =
    typeof (location.state as { from?: { pathname?: string } } | null)?.from?.pathname === "string"
      ? (location.state as { from: { pathname: string } }).from.pathname
      : "/";

  if (status === "idle" || status === "bootstrapping") {
    return (
      <FullscreenState>
        <LoadingState compact title="Открываем вход" description="Проверяем текущую сессию." />
      </FullscreenState>
    );
  }

  if (status === "authenticated") {
    return <Navigate to={nextPath} replace />;
  }

  return <Outlet />;
}

export function RoleGuard({ allowedRoles }: { allowedRoles: RoleCode[] }) {
  const roleCode = useAuthStore((state) => state.user?.role_code);

  if (!roleCode || !allowedRoles.includes(roleCode)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}

export function PermissionGuard({ permissionCode }: { permissionCode: PermissionCode }) {
  const user = useAuthStore((state) => state.user);

  if (!canPermission(user, permissionCode)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
