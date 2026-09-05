import { useEffect } from "react";
import { Outlet, useMatches } from "react-router-dom";

import { useAuthStore } from "@/features/auth/model/auth-store";
import { BRAND_NAME } from "@/shared/config/brand";
import { useOnlineStatus } from "@/shared/hooks/use-online-status";
import { MobileBottomNav } from "@/widgets/app-shell/mobile-bottom-nav";
import { Sidebar } from "@/widgets/app-shell/sidebar";
import { Topbar } from "@/widgets/app-shell/topbar";

type RouteHandle = {
  title?: string;
};

export function AppShell() {
  const isOnline = useOnlineStatus();
  const matches = useMatches();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  const currentHandle = [...matches].reverse().find((match) => (match.handle as RouteHandle | undefined)?.title)?.handle as
    | RouteHandle
    | undefined;
  const title = currentHandle?.title ?? BRAND_NAME;

  useEffect(() => {
    document.title = `${title} • ${BRAND_NAME}`;
  }, [title]);

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh max-w-[1800px]">
        <Sidebar user={user} />
        <div className="flex min-h-svh min-w-0 flex-1 flex-col">
          <Topbar isOnline={isOnline} onLogout={() => void logout()} user={user} />
          <main id="app-main-region" className="relative flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
