import { apiRequest } from "@/shared/api/client";
import type { AnalyticsDashboard, AnalyticsDrilldown } from "@/entities/analytics/model/types";

export type AnalyticsParams = {
  categoryIds?: number[];
  dateFrom?: string;
  dateTo?: string;
  financeCategoryIds?: number[];
  orderStatuses?: string[];
  periodPreset?: string;
};

export type AnalyticsDrilldownParams = AnalyticsParams & {
  categoryId?: number;
  clientId?: number;
  metric: string;
  pointFrom?: string;
  pointTo?: string;
  serviceName?: string;
};

function toQueryString(params: AnalyticsParams | AnalyticsDrilldownParams) {
  const searchParams = new URLSearchParams();
  if (params.dateFrom) {
    searchParams.set("date_from", params.dateFrom);
  }
  if (params.dateTo) {
    searchParams.set("date_to", params.dateTo);
  }
  if (params.periodPreset) {
    searchParams.set("period_preset", params.periodPreset);
  }
  params.categoryIds?.forEach((categoryId) => {
    searchParams.append("category_ids", String(categoryId));
  });
  params.orderStatuses?.forEach((status) => {
    searchParams.append("order_statuses", status);
  });
  params.financeCategoryIds?.forEach((categoryId) => {
    searchParams.append("finance_category_ids", String(categoryId));
  });
  if ("metric" in params) {
    searchParams.set("metric", params.metric);
  }
  if ("categoryId" in params && params.categoryId) {
    searchParams.set("category_id", String(params.categoryId));
  }
  if ("clientId" in params && params.clientId) {
    searchParams.set("client_id", String(params.clientId));
  }
  if ("serviceName" in params && params.serviceName) {
    searchParams.set("service_name", params.serviceName);
  }
  if ("pointFrom" in params && params.pointFrom) {
    searchParams.set("point_from", params.pointFrom);
  }
  if ("pointTo" in params && params.pointTo) {
    searchParams.set("point_to", params.pointTo);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getAnalyticsDashboardRequest(params: AnalyticsParams) {
  return apiRequest<AnalyticsDashboard>(`/analytics/dashboard${toQueryString(params)}`);
}

export function getAnalyticsDrilldownRequest(params: AnalyticsDrilldownParams) {
  return apiRequest<AnalyticsDrilldown>(`/analytics/drilldown${toQueryString(params)}`);
}
