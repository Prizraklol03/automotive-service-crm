import { apiRequest } from "@/shared/api/client";
import type { PaginatedResponse } from "@/shared/model/pagination";
import type { Order, OrderCreatePayload, OrderListSummary, OrderStatus, OrderSummary, OrderUpdatePayload } from "@/entities/order/model/types";
import type { OrderSortPreference } from "@/entities/settings/model/types";

export type OrderFilters = {
  brand?: string;
  client?: string;
  hasComment?: boolean;
  hasDocuments?: boolean;
  model?: string;
  paymentStatus?: Array<"unpaid" | "partial" | "paid">;
  plate?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
};

export function listOrdersRequest(archived?: boolean) {
  const query = typeof archived === "boolean" ? `?archived=${archived}` : "";
  return apiRequest<Order[]>(`/orders${query}`);
}

export type OrdersPageRequest = OrderFilters & {
  archivedScope?: "active" | "archived" | "all";
  page: number;
  pageSize: number;
  search?: string;
  sortDescriptors?: OrderSortPreference[];
  status?: string[];
};

export function listOrdersPageRequest(filters: OrdersPageRequest) {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize)
  });
  if (filters.archivedScope) {
    searchParams.set("archived_scope", filters.archivedScope);
  }
  if (filters.search?.trim()) {
    searchParams.set("search", filters.search.trim());
  }
  if (filters.status?.length) {
    searchParams.set("status", filters.status.join(","));
  }
  const optionalParams: Array<[string, string | boolean | undefined]> = [
    ["scheduled_from", filters.scheduledFrom],
    ["scheduled_to", filters.scheduledTo],
    ["updated_from", filters.updatedFrom],
    ["updated_to", filters.updatedTo],
    ["has_comment", filters.hasComment],
    ["has_documents", filters.hasDocuments],
    ["client", filters.client?.trim()],
    ["brand", filters.brand?.trim()],
    ["model", filters.model?.trim()],
    ["plate", filters.plate?.trim()]
  ];
  optionalParams.forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  if (filters.paymentStatus?.length) {
    searchParams.set("payment_status", filters.paymentStatus.join(","));
  }
  if (filters.sortDescriptors?.length) {
    searchParams.set("sort_by", filters.sortDescriptors.map((descriptor) => descriptor.key).join(","));
    searchParams.set("sort_dir", filters.sortDescriptors.map((descriptor) => descriptor.direction).join(","));
  }

  return apiRequest<PaginatedResponse<OrderSummary>>(`/orders?${searchParams.toString()}`);
}

export function getOrderListSummaryRequest(filters: Omit<OrdersPageRequest, "page" | "pageSize" | "sortDescriptors" | "status">) {
  const searchParams = new URLSearchParams();
  if (filters.archivedScope) {
    searchParams.set("archived_scope", filters.archivedScope);
  }
  if (filters.search?.trim()) {
    searchParams.set("search", filters.search.trim());
  }
  return apiRequest<OrderListSummary>(`/orders/summary${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);
}

export function searchOrdersRequest(query: string, archived?: boolean) {
  const params = new URLSearchParams({ q: query });
  if (typeof archived === "boolean") {
    params.set("archived", String(archived));
  }

  return apiRequest<OrderSummary[]>(`/orders/search?${params.toString()}`);
}

export function getOrderRequest(orderId: number) {
  return apiRequest<Order>(`/orders/${orderId}`);
}

export function createOrderRequest(payload: OrderCreatePayload) {
  return apiRequest<Order>("/orders", {
    method: "POST",
    body: payload
  });
}

export function updateOrderRequest(orderId: number, payload: OrderUpdatePayload) {
  return apiRequest<Order>(`/orders/${orderId}`, {
    method: "PUT",
    body: payload
  });
}

export function updateOrderStatusRequest(orderId: number, status: OrderStatus) {
  return apiRequest<Order>(`/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status }
  });
}
