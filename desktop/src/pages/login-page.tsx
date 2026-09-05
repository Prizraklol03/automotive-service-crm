import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/features/auth/ui/login-form";
import { BRAND_ENV_BADGE, BRAND_NAME, IS_STAGING_BRAND } from "@/shared/config/brand";
import { BrandMark } from "@/shared/ui/brand-mark";

export function LoginPage() {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--accent)/0.16),transparent_24%)]" />
      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="glass-panel hidden rounded-[32px] p-8 lg:flex lg:flex-col lg:justify-center">
          <div className="space-y-8">
            <BrandMark hideBadge />
            <p className="max-w-lg text-4xl font-semibold tracking-tight text-foreground">
              Рабочее пространство для управления автомобильным сервисом.
            </p>
          </div>
        </section>

        <section className="glass-panel rounded-[32px] p-6 sm:p-8">
          {IS_STAGING_BRAND ? (
            <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/12 px-4 py-3 text-sm font-medium text-amber-100 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-950">
                  {BRAND_ENV_BADGE}
                </span>
                <span>Тестовый контур. Используйте его только для проверки и обучения.</span>
              </div>
            </div>
          ) : null}
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-muted text-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{BRAND_NAME}</p>
              <h2 className="text-2xl font-semibold">Вход в рабочее пространство</h2>
            </div>
          </div>

          <LoginForm />
        </section>
      </div>
    </div>
  );
}
