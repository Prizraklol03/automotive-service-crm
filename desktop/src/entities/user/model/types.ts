import type { PermissionCode } from "@/entities/user/model/permissions";

export type RoleCode = "admin" | "standard_user";

export type CurrentUser = {
  full_name: string;
  id: number;
  is_active: boolean;
  login: string;
  role_code: RoleCode;
  permissions?: PermissionCode[];
};
