import { type PropsWithChildren, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/shared/api/query-client";
import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  useOrderStatusesQuery,
  useVisualConfigQuery,
} from "@/features/settings/api/settings-hooks";
import { useVisualTheme } from "@/shared/hooks/use-visual-theme";
import { useThemeStore } from "@/shared/model/theme-store";

function ThemeApplier() {
  const visualQuery = useVisualConfigQuery();
  const statusesQuery = useOrderStatusesQuery();
  const statusCodes = statusesQuery.data?.map((s) => s.code) ?? [];
  const themeMode = useThemeStore((state) => state.mode);
  useVisualTheme(visualQuery.data, statusCodes, themeMode);
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    void useAuthStore.getState().bootstrapSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeApplier />
      {children}
    </QueryClientProvider>
  );
}
