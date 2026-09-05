import { useQuery } from "@tanstack/react-query";

import {
  getAnalyticsDashboardRequest,
  getAnalyticsDrilldownRequest,
  type AnalyticsDrilldownParams,
  type AnalyticsParams
} from "@/entities/analytics/api/analytics-api";

export function analyticsDashboardQueryKey(filters: AnalyticsParams) {
  return ["analytics", "dashboard", filters] as const;
}

export function analyticsDrilldownQueryKey(filters: AnalyticsDrilldownParams | null) {
  return ["analytics", "drilldown", filters] as const;
}

export function useAnalyticsDashboardQuery(filters: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsDashboardQueryKey(filters),
    queryFn: () => getAnalyticsDashboardRequest(filters)
  });
}

export function useAnalyticsDrilldownQuery(filters: AnalyticsDrilldownParams | null) {
  return useQuery({
    queryKey: analyticsDrilldownQueryKey(filters),
    queryFn: () => getAnalyticsDrilldownRequest(filters as AnalyticsDrilldownParams),
    enabled: Boolean(filters)
  });
}
