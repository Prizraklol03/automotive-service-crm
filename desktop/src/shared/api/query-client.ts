import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false
    },
    queries: {
      retry(failureCount, error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          return false;
        }

        return failureCount < 2;
      },
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      staleTime: 30_000
    }
  }
});
