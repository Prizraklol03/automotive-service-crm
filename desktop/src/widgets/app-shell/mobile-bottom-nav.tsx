import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { MoreHorizontal, X } from "lucide-react";

import { getVisibleNavigationItems } from "@/app/config/navigation";
import { DEFAULT_MODULES_CONFIG } from "@/entities/settings/model/types";
import type { CurrentUser } from "@/entities/user/model/types";
import { useModulesQuery } from "@/features/settings/api/settings-hooks";
import { useNotificationsListQuery } from "@/features/notifications/api/notifications-hooks";
import { cn } from "@/shared/lib/cn";

export function MobileBottomNav({ user }: { user: CurrentUser }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const location = useLocation();

  const modulesQuery = useModulesQuery();
  const enabledModules = modulesQuery.data ?? DEFAULT_MODULES_CONFIG;

  const items = getVisibleNavigationItems(user, enabledModules);

  const dueNotificationsQuery = useNotificationsListQuery("due");
  const dueCount = dueNotificationsQuery.data?.length ?? 0;

  const primaryItems = items.filter((item) => item.primary);
  const moreItems = items.filter((item) => !item.primary);

  const isMoreActive = moreItems.some((item) => location.pathname.startsWith(item.to));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-surface/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
        <div className="flex items-stretch">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const hasDueNotifications = item.id === "notifications" && dueCount > 0;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors active:bg-accent-muted/60",
                    isActive ? "text-foreground" : "hover:text-foreground/70",
                    hasDueNotifications && "text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-xl transition-colors", isActive && "bg-accent-muted")}>
                      <Icon className={cn("h-[18px] w-[18px]", hasDueNotifications && "text-warning")} />
                    </span>
                    {hasDueNotifications ? (
                      <span className="absolute right-3.5 top-1.5 h-2 w-2 rounded-full bg-warning shadow-[0_0_0_2px_hsl(var(--surface))]" />
                    ) : null}
                    <span className="line-clamp-1 leading-none">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {moreItems.length > 0 && (
            <button
              type="button"
              aria-label="Ещё"
              onClick={() => setIsMoreOpen(true)}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors active:bg-accent-muted/60",
                (isMoreOpen || isMoreActive) ? "text-foreground" : "hover:text-foreground/70"
              )}
            >
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-xl transition-colors", (isMoreOpen || isMoreActive) && "bg-accent-muted")}>
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </span>
              {isMoreActive && !isMoreOpen ? (
                <span className="absolute right-3.5 top-1.5 h-2 w-2 rounded-full bg-accent shadow-[0_0_0_2px_hsl(var(--surface))]" />
              ) : null}
              <span className="leading-none">Ещё</span>
            </button>
          )}
        </div>
      </nav>

      {/* "Ещё" drawer */}
      {isMoreOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-border/80 bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Меню</span>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setIsMoreOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-surface-2 text-muted-foreground transition-colors active:bg-accent-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 px-3 pb-1 pt-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    aria-label={item.label}
                    onClick={() => setIsMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3.5 text-[12px] font-medium transition-colors active:scale-95",
                      isActive
                        ? "bg-accent-muted text-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="line-clamp-1 text-center leading-tight">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
