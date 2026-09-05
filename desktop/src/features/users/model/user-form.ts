import { z } from "zod";

import type { User, UserPayload, UserUpdatePayload } from "@/entities/crm-user/model/types";

const weakPasswords = new Set([
  "123456789012",
  "admin-password",
  "admin-pass",
  "example-password",
  "example-password-45",
  "employee-pass",
  "password1234",
  "qwerty123456",
  "user-password",
  "user-pass"
]);

function isAcceptablePassword(password: string) {
  if (password === "") return true;
  const normalized = password.trim().toLowerCase();
  return password.length >= 12 && password.length <= 1024 && normalized.length > 0 && !weakPasswords.has(normalized) && new Set(normalized).size > 1;
}

export const userFormSchema = z.object({
  full_name: z.string().trim().min(1, "Укажите ФИО"),
  login: z.string().trim().min(1, "Укажите логин"),
  password: z.string().refine(isAcceptablePassword, "Используйте надёжный пароль или парольную фразу не короче 12 символов")
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export function mapUserToFormValues(user: User): UserFormValues {
  return {
    full_name: user.full_name,
    login: user.login,
    password: ""
  };
}

export function mapFormValuesToUserPayload(values: UserFormValues): UserPayload {
  return {
    full_name: values.full_name.trim(),
    is_active: true,
    login: values.login.trim(),
    password: values.password,
    role_code: "standard_user"
  };
}

export function mapFormValuesToUserUpdatePayload(values: UserFormValues, user: User): UserUpdatePayload {
  return {
    full_name: values.full_name.trim(),
    is_active: user.is_active,
    login: values.login.trim(),
    role_code: user.role_code
  };
}
