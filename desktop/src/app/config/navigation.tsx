import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CarFront,
  ChartColumnBig,
  ClipboardList,
  FileText,
  Landmark,
  NotebookText,
  Package,
  Settings,
  ShieldUser,
  Users,
  Wrench
} from "lucide-react";

import type { ModuleKey } from "@/entities/settings/model/types";
import type { PermissionCode } from "@/entities/user/model/permissions";

export type NavigationItem = {
  icon: LucideIcon;
  id: string;
  label: string;
  module?: ModuleKey;
  /** Show directly in the mobile bottom bar (max 4 items). Others go into the "Ещё" drawer. */
  primary?: boolean;
  permission?: PermissionCode;
  to: string;
};

export const navigationItems: NavigationItem[] = [
  { id: "orders", label: "Заказы", to: "/orders", icon: ClipboardList, primary: true, permission: "orders.view" },
  { id: "clients", label: "Клиенты", to: "/clients", icon: Users, primary: true, permission: "clients.view" },
  { id: "vehicles", label: "Авто", to: "/vehicles", icon: CarFront, primary: true, permission: "vehicles.view" },
  { id: "calendar", label: "Календарь", to: "/calendar", icon: CalendarDays, primary: true },
  { id: "services", label: "Услуги", to: "/services", icon: Wrench, permission: "settings.catalog.manage" },
  { id: "notes", label: "Заметки", to: "/notes", icon: NotebookText },
  { id: "documents", label: "Документы", to: "/documents", icon: FileText },
  { id: "materials", label: "Расходники", to: "/materials", icon: Package, permission: "materials.view" },
  { id: "finance", label: "Финансы", to: "/finance", icon: Landmark, permission: "finance.view" },
  { id: "analytics", label: "Аналитика", to: "/analytics", icon: ChartColumnBig, permission: "analytics.view" },
  { id: "users", label: "Пользователи", to: "/users", icon: ShieldUser, permission: "settings.users.manage" },
  { id: "settings", label: "Настройки", to: "/settings", icon: Settings }
];

export function getVisibleNavigationItems(
  user: { permissions?: PermissionCode[]; role_code: string } | null | undefined,
  enabledModules: Partial<Record<ModuleKey, boolean>>
) {
  return navigationItems.filter((item) => {
    if (item.permission && (!user || (user.role_code !== "admin" && !(user.permissions ?? []).includes(item.permission)))) {
      return false;
    }

    if (item.module && !enabledModules[item.module]) {
      return false;
    }

    return true;
  });
}
