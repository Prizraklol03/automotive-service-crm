import { z } from "zod";

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль")
});

export type LoginFormValues = z.infer<typeof loginSchema>;
