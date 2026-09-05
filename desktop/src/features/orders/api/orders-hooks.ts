import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { getClientRequest } from "@/entities/client/api/client-api";
import {
  getOrderListSummaryRequest,
  createOrderRequest,
  getOrderRequest,
  listOrdersPageRequest,
  searchOrdersRequest,
  updateOrderRequest,
  updateOrderStatusRequest
} from "@/entities/order/api/order-api";
import type { OrderFilters } from "@/entities/order/api/order-api";
import type { OrderCreatePayload, OrderListSummary, OrderStatus, OrderSummary, OrderUpdatePayload } from "@/entities/order/model/types";
import { getVehicleRequest } from "@/entities/vehicle/api/vehicle-api";
import type { OrderSortDescriptor } from "@/features/orders/model/order-sorting";
import { useInfinitePagedQuery } from "@/shared/hooks/use-infinite-paged-query";
import type { PaginatedResponse } from "@/shared/model/pagination";

export function ordersListQueryKey(search: string, archived?: boolean) {
  return ["orders", "list", { archived, search }] as const;
}

export function ordersPageQueryKey(filters: OrderFilters & {
  archivedScope?: "active" | "archived" | "all";
  page: number;
  pageSize: number;
  search: string;
  sortDescriptors: OrderSortDescriptor[];
  status: string[];
}) {
  return ["orders", "page", filters] as const;
}

export function orderListSummaryQueryKey(filters: { archivedScope?: "active" | "archived" | "all"; search: string }) {
  return ["orders", "summary", filters] as const;
}

export function orderDetailQueryKey(orderId: number) {
  return ["orders", "detail", orderId] as const;
}

export function useOrdersListQuery({ archived, search }: { archived?: boolean; search: string }, enabled = true) {
  const normalizedSearch = search.trim();

  return useQuery<OrderSummary[]>({
    queryKey: ordersListQueryKey(normalizedSearch, archived),
    queryFn: () => searchOrdersRequest(normalizedSearch, archived),
    placeholderData: keepPreviousData,
    enabled
  });
}

export function useOrdersPageQuery(filters: OrderFilters & {
  archivedScope?: "active" | "archived" | "all";
  page: number;
  pageSize: number;
  search: string;
  sortDescriptors: OrderSortDescriptor[];
  status: string[];
}) {
  return useQuery({
    queryKey: ordersPageQueryKey(filters),
    queryFn: () => listOrdersPageRequest(filters),
    placeholderData: keepPreviousData
  });
}

export function useOrdersInfiniteQuery(filters: OrderFilters & {
  archivedScope?: "active" | "archived" | "all";
  search: string;
  sortDescriptors: OrderSortDescriptor[];
  status: string[];
  pageSize: number;
}) {
  const normalizedFilters = {
    ...filters,
    search: filters.search.trim()
  };

  return useInfinitePagedQuery<OrderSummary, PaginatedResponse<OrderSummary>>({
    queryKey: ["orders", "infinite", normalizedFilters] as const,
    queryFn: (page) =>
      listOrdersPageRequest({
        ...normalizedFilters,
        page,
        pageSize: normalizedFilters.pageSize
      })
  });
}

export function useOrderListSummaryQuery(filters: { archivedScope?: "active" | "archived" | "all"; search: string }) {
  return useQuery<OrderListSummary>({
    queryKey: orderListSummaryQueryKey(filters),
    queryFn: () => getOrderListSummaryRequest(filters),
    placeholderData: keepPreviousData
  });
}

export function useOrderDetailQuery(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: orderId ? orderDetailQueryKey(orderId) : ["orders", "detail", "empty"],
    queryFn: () => getOrderRequest(orderId as number),
    enabled: orderId !== null && enabled,
    staleTime: 30_000
  });
}

export function useOrderRelatedQueries(orderId: number | null, clientId?: number, vehicleId?: number) {
  const results = useQueries({
    queries: [
      {
        queryKey: clientId ? ["clients", "detail", clientId] : ["clients", "detail", "empty"],
        queryFn: () => getClientRequest(clientId as number),
        enabled: orderId !== null && typeof clientId === "number"
      },
      {
        queryKey: vehicleId ? ["vehicles", "detail", vehicleId] : ["vehicles", "detail", "empty"],
        queryFn: () => getVehicleRequest(vehicleId as number),
        enabled: orderId !== null && typeof vehicleId === "number"
      }
    ]
  });

  return {
    clientQuery: results[0],
    vehicleQuery: results[1]
  };
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OrderCreatePayload) => createOrderRequest(payload),
    onSuccess: (order) => {
      queryClient.setQueryData(orderDetailQueryKey(order.id), order);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}

export function useUpdateOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: OrderUpdatePayload }) => updateOrderRequest(orderId, payload),
    onSuccess: (order) => {
      queryClient.setQueryData(orderDetailQueryKey(order.id), order);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}

export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: OrderStatus }) => updateOrderStatusRequest(orderId, status),
    onSuccess: (order) => {
      queryClient.setQueryData(orderDetailQueryKey(order.id), order);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}
