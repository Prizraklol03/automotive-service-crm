import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router-dom";

import { PermissionGuard, ProtectedRoute, PublicOnlyRoute } from "@/app/router/guards";
import { getVisibleNavigationItems } from "@/app/config/navigation";
import { DEFAULT_MODULES_CONFIG } from "@/entities/settings/model/types";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { useModulesQuery } from "@/features/settings/api/settings-hooks";
import { RouteFallback } from "@/shared/ui/route-fallback";
import { AppShell } from "@/widgets/app-shell/app-shell";

const LoginPage = lazy(() => import("@/pages/login-page").then((module) => ({ default: module.LoginPage })));
const OrdersPage = lazy(() => import("@/pages/orders-page").then((module) => ({ default: module.OrdersPage })));
const CalendarPage = lazy(() => import("@/pages/calendar-page").then((module) => ({ default: module.CalendarPage })));
const ClientsPage = lazy(() => import("@/pages/clients-page").then((module) => ({ default: module.ClientsPage })));
const VehiclesPage = lazy(() => import("@/pages/vehicles-page").then((module) => ({ default: module.VehiclesPage })));
const ServicesPage = lazy(() => import("@/pages/services-page").then((module) => ({ default: module.ServicesPage })));
const NotesPage = lazy(() => import("@/pages/notes-page").then((module) => ({ default: module.NotesPage })));
const MaterialsPage = lazy(() => import("@/pages/materials-page").then((module) => ({ default: module.MaterialsPage })));
const FinancePage = lazy(() => import("@/pages/finance-page").then((module) => ({ default: module.FinancePage })));
const NotificationsPage = lazy(() => import("@/pages/notifications-page").then((module) => ({ default: module.NotificationsPage })));
const ExternalLeadsPage = lazy(() => import("@/pages/external-leads-page").then((module) => ({ default: module.ExternalLeadsPage })));
const DocumentsPage = lazy(() => import("@/pages/documents-page").then((module) => ({ default: module.DocumentsPage })));
const AnalyticsPage = lazy(() => import("@/pages/analytics-page").then((module) => ({ default: module.AnalyticsPage })));
const UsersPage = lazy(() => import("@/pages/users-page").then((module) => ({ default: module.UsersPage })));
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })));
const ForbiddenPage = lazy(() => import("@/pages/forbidden-page").then((module) => ({ default: module.ForbiddenPage })));
const NotFoundPage = lazy(() => import("@/pages/not-found-page").then((module) => ({ default: module.NotFoundPage })));
const PhotoSharePage = lazy(() => import("@/pages/photo-share-page").then((module) => ({ default: module.PhotoSharePage })));

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

function LegacyVehiclesRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/vehicles${location.search}${location.hash}`} />;
}

function HomeRedirect() {
  const user = useAuthStore((state) => state.user);
  const modulesQuery = useModulesQuery();
  const enabledModules = modulesQuery.data ?? DEFAULT_MODULES_CONFIG;
  const visibleNavigationItems = getVisibleNavigationItems(user, enabledModules);
  const firstVisiblePath = visibleNavigationItems[0]?.to ?? "/forbidden";

  return <Navigate replace to={firstVisiblePath} />;
}

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/login",
        element: withSuspense(<LoginPage />),
        handle: { title: "Вход" }
      }
    ]
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { element: <PermissionGuard permissionCode="orders.view" />, children: [{ path: "/orders", element: withSuspense(<OrdersPage />), handle: { title: "Заказы" } }] },
          { path: "/calendar", element: withSuspense(<CalendarPage />), handle: { title: "Календарь" } },
          { element: <PermissionGuard permissionCode="clients.view" />, children: [{ path: "/clients", element: withSuspense(<ClientsPage />), handle: { title: "Клиенты" } }] },
          { element: <PermissionGuard permissionCode="vehicles.view" />, children: [{ path: "/vehicles", element: withSuspense(<VehiclesPage />), handle: { title: "Авто" } }] },
          { path: "/cars", element: <LegacyVehiclesRedirect /> },
          { path: "/notes", element: withSuspense(<NotesPage />), handle: { title: "Заметки" } },
          { path: "/notifications", element: withSuspense(<NotificationsPage />), handle: { title: "Уведомления" } },
          {
            element: <PermissionGuard permissionCode="orders.view" />,
            children: [
              {
                path: "/integrations/external-leads",
                element: withSuspense(<ExternalLeadsPage />),
                handle: { title: "Внешние заявки" }
              }
            ]
          },
          { path: "/documents", element: withSuspense(<DocumentsPage />), handle: { title: "Документы" } },
          { path: "/settings", element: withSuspense(<SettingsPage />), handle: { title: "Настройки" } },
          { element: <PermissionGuard permissionCode="materials.view" />, children: [{ path: "/materials", element: withSuspense(<MaterialsPage />), handle: { title: "Расходники" } }] },
          { element: <PermissionGuard permissionCode="finance.view" />, children: [{ path: "/finance", element: withSuspense(<FinancePage />), handle: { title: "Финансы" } }] },
          { element: <PermissionGuard permissionCode="settings.catalog.manage" />, children: [{ path: "/services", element: withSuspense(<ServicesPage />), handle: { title: "Услуги" } }] },
          { element: <PermissionGuard permissionCode="analytics.view" />, children: [{ path: "/analytics", element: withSuspense(<AnalyticsPage />), handle: { title: "Аналитика" } }] },
          {
            element: <PermissionGuard permissionCode="settings.users.manage" />,
            children: [
              { path: "/users", element: withSuspense(<UsersPage />), handle: { title: "Пользователи" } }
            ]
          }
        ]
      }
    ]
  },
  {
    path: "/p/:token",
    element: withSuspense(<PhotoSharePage />),
    handle: { title: "Фотоотчёт" }
  },
  {
    path: "/forbidden",
    element: withSuspense(<ForbiddenPage />),
    handle: { title: "Нет доступа" }
  },
  {
    path: "*",
    element: withSuspense(<NotFoundPage />),
    handle: { title: "Не найдено" }
  }
]);
