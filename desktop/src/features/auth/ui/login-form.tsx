import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";

import { BRAND_NAME } from "@/shared/config/brand";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { loginSchema, type LoginFormValues } from "@/features/auth/model/login-schema";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";

export function LoginForm() {
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);

  const isPending = status === "bootstrapping";

  const form = useForm<LoginFormValues>({
    defaultValues: {
      login: "",
      password: ""
    },
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (values: LoginFormValues) => {
    await login(values);
  };

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="login">
          Логин
        </label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <AppInput id="login" autoComplete="username" autoFocus className="pl-9" disabled={isPending} {...form.register("login")} />
        </div>
        {form.formState.errors.login ? <p className="text-xs text-danger">{form.formState.errors.login.message}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="password">
          Пароль
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <AppInput
            id="password"
            autoComplete="current-password"
            className="pl-9"
            disabled={isPending}
            type="password"
            {...form.register("password")}
          />
        </div>
        {form.formState.errors.password ? <p className="text-xs text-danger">{form.formState.errors.password.message}</p> : null}
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{errorMessage}</p>
      ) : null}

      <AppButton className="w-full" size="lg" type="submit" disabled={isPending}>
        {isPending ? "Подключение..." : `Войти в ${BRAND_NAME}`}
      </AppButton>
    </form>
  );
}
