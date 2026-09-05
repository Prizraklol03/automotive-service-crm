import { NavLink } from "react-router-dom";
import { Bell, LogOut, WifiOff } from "lucide-react";

import type { CurrentUser } from "@/entities/user/model/types";
import { ExternalLeadsIndicator } from "@/features/external-leads/ui/external-leads-indicator";
import { useNotificationsListQuery } from "@/features/notifications/api/notifications-hooks";
import { BRAND_ENV_BADGE, BRAND_LOGO_PATH, BRAND_NAME, IS_STAGING_BRAND } from "@/shared/config/brand";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";

export function Topbar({
  isOnline,
  onLogout,
  user
}: {
  isOnline: boolean;
  onLogout: () => void;
  user: CurrentUser;
}) {
  const dueNotificationsQuery = useNotificationsListQuery("due");
  const dueCount = dueNotificationsQuery.data?.length ?? 0;

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      {!isOnline ? (
        <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-xs text-danger sm:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center gap-2">
            <WifiOff className="h-3.5 w-3.5" />
            Соединение потеряно. Некоторые действия временно недоступны.
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-3 lg:hidden">
            <div className="inline-flex items-center justify-center rounded-xl border border-[#d8dbd3] bg-[#f3f1ea] px-3 py-2 shadow-soft">
              <img alt={`${BRAND_NAME} logo`} className="h-6 w-auto object-contain" src={BRAND_LOGO_PATH} />
            </div>
            {IS_STAGING_BRAND ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/12 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100">
                {BRAND_ENV_BADGE}
              </div>
            ) : null}
          </div>
        </div>

        {IS_STAGING_BRAND ? (
          <div className="hidden rounded-2xl border border-amber-500/40 bg-amber-500/12 px-4 py-2 text-sm font-semibold text-amber-100 lg:flex lg:items-center lg:gap-3">
            <span className="inline-flex rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-950">
              {BRAND_ENV_BADGE}
            </span>
            <span>{BRAND_NAME}</span>
          </div>
        ) : null}

        <ExternalLeadsIndicator />

        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            cn(
              "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground",
              isActive && "bg-accent-muted text-foreground",
              dueCount > 0 && "text-foreground"
            )
          }
          aria-label="Уведомления"
        >
          <Bell className={cn("h-4 w-4", dueCount > 0 && "text-warning")} />
          {dueCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold leading-none text-background">
              {dueCount > 99 ? "99+" : dueCount}
            </span>
          ) : null}
        </NavLink>

        <AppButton className="lg:hidden" size="icon" variant="ghost" onClick={onLogout} aria-label="Выйти">
          <LogOut className="h-4 w-4" />
        </AppButton>

        <div className="hidden items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2 lg:flex">
          <p className="text-sm font-medium">{user.full_name}</p>
          {!isOnline ? <WifiOff className="h-4 w-4 text-danger" /> : null}
          <AppButton size="icon" variant="ghost" onClick={onLogout} aria-label="Выйти">
            <LogOut className="h-4 w-4" />
          </AppButton>
        </div>
      </div>
    </header>
  );
}
