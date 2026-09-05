import type { CurrentUser } from "@/entities/user/model/types";

export const ALL_PERMISSION_CODES = [
  "clients.view",
  "clients.create",
  "clients.edit",
  "vehicles.view",
  "vehicles.create",
  "vehicles.edit",
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.payments.create",
  "orders.payments.edit",
  "orders.payments.delete",
  "orders.change_prices",
  "orders.complete",
  "orders.documents",
  "personal_data.view",
  "personal_data.edit",
  "personal_data.export",
  "documents.view",
  "documents.download",
  "documents.generate",
  "photos.view",
  "photos.upload",
  "audit_logs.view",
  "materials.view",
  "materials.manage",
  "finance.view",
  "finance.expenses.create",
  "finance.expenses.edit_delete",
  "analytics.view",
  "settings.users.manage",
  "settings.catalog.manage"
] as const;

export const DEFAULT_STANDARD_USER_PERMISSION_CODES = [
  "clients.view",
  "clients.create",
  "clients.edit",
  "vehicles.view",
  "vehicles.create",
  "vehicles.edit",
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.change_prices",
  "orders.complete",
  "orders.documents",
  "personal_data.view",
  "personal_data.edit",
  "documents.view",
  "documents.download",
  "documents.generate",
  "photos.view",
  "photos.upload",
  "materials.view",
  "materials.manage",
  "finance.view",
  "finance.expenses.create"
] as const;

export type PermissionCode = (typeof ALL_PERMISSION_CODES)[number];

export function canPermission(user: Pick<CurrentUser, "permissions" | "role_code"> | null | undefined, permissionCode: PermissionCode): boolean {
  if (!user) {
    return false;
  }

  if (user.role_code === "admin") {
    return true;
  }

  return user.permissions?.includes(permissionCode) ?? false;
}
