import type { RoleCode } from "@/entities/user/model/types";

export type User = {
  full_name: string;
  id: number;
  is_active: boolean;
  login: string;
  role_code: RoleCode;
};

export type UserPayload = {
  full_name: string;
  is_active: boolean;
  login: string;
  password: string;
  role_code: RoleCode;
};

export type UserUpdatePayload = Omit<UserPayload, "password">;

export type UserActivity = {
  action: string;
  created_at: string;
  description: string | null;
  entity_id: number | null;
  entity_type: string;
  id: number;
  title: string;
};

export type UserActivityFeed = {
  activities: UserActivity[];
  user_id: number;
};
