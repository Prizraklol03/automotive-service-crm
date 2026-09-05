import { NavLink } from "react-router-dom";

import { getVisibleNavigationItems } from "@/app/config/navigation";
import { DEFAULT_MODULES_CONFIG } from "@/entities/settings/model/types";
import type { CurrentUser } from "@/entities/user/model/types";
import { useModulesQuery } from "@/features/settings/api/settings-hooks";
import { useNotificationsListQuery } from "@/features/notifications/api/notifications-hooks";
import { BRAND_ENV_BADGE, BRAND_FULL_NAME, BRAND_LOGO_PATH, IS_STAGING_BRAND } from "@/shared/config/brand";
import { cn } from "@/shared/lib/cn";

export function Sidebar({ user }: { user: CurrentUser }) {
  const modulesQuery = useModulesQuery();
  const enabledModules = modulesQuery.data ?? DEFAULT_MODULES_CONFIG;

  const items = getVisibleNavigationItems(user, enabledModules);

  const dueNotificationsQuery = useNotificationsListQuery("due");
  const dueCount = dueNotificationsQuery.data?.length ?? 0;

  return (
    <aside className="sticky top-0 hidden h-svh w-[300px] flex-col border-r border-border/80 bg-surface/85 px-5 py-6 lg:flex">
      <NavLink to="/orders" className="block rounded-2xl transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-accent/40">
        <div className="space-y-3">
          <div className="flex min-h-[64px] max-w-[172px] items-center justify-center rounded-[18px] border border-[#d8dbd3] bg-[#f3f1ea] px-3 py-2 shadow-soft">
            <img alt="Automotive Service CRM logo" className="h-7 w-auto object-contain" src={BRAND_LOGO_PATH} />
          </div>
          <div className="space-y-1">
            <h2 className="max-w-[220px] text-lg font-semibold leading-tight text-foreground">{BRAND_FULL_NAME}</h2>
            {IS_STAGING_BRAND ? (
              <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-100">
                {BRAND_ENV_BADGE}
              </span>
            ) : null}
          </div>
        </div>
      </NavLink>

      <nav className="mt-8 flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const hasDueNotifications = item.id === "notifications" && dueCount > 0;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
                  isActive && "bg-accent-muted text-foreground"
                )
              }
            >
              <Icon className={cn("h-4 w-4", hasDueNotifications && "text-warning")} />
              <span className={cn("flex-1", hasDueNotifications && "text-foreground")}>{item.label}</span>
              {hasDueNotifications ? (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                  {dueCount}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
