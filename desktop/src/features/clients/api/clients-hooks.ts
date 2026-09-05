import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveClientRequest,
  createClientRequest,
  getClientRequest,
  listClientOrdersRequest,
  listClientsPageRequest,
  listClientsRequest,
  searchClientsRequest,
  updateClientRequest
} from "@/entities/client/api/client-api";
import type { Client, ClientPayload } from "@/entities/client/model/types";
import { useInfinitePagedQuery } from "@/shared/hooks/use-infinite-paged-query";
import type { PaginatedResponse } from "@/shared/model/pagination";

export function clientsListQueryKey(search: string) {
  return ["clients", "list", search] as const;
}

export function clientDetailQueryKey(clientId: number) {
  return ["clients", "detail", clientId] as const;
}

export function clientOrdersQueryKey(clientId: number) {
  return ["clients", "orders", clientId] as const;
}

export function useClientsListQuery(search: string, enabled = true) {
  const normalizedSearch = search.trim();

  return useQuery({
    queryKey: clientsListQueryKey(normalizedSearch),
    queryFn: () => (normalizedSearch ? searchClientsRequest(normalizedSearch) : listClientsRequest()),
    enabled
  });
}

export function useClientsPageQuery(filters: {
  page: number;
  pageSize: number;
  search: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  const normalizedSearch = filters.search.trim();

  return useQuery({
    queryKey: ["clients", "page", { ...filters, search: normalizedSearch }],
    queryFn: () =>
      listClientsPageRequest({
        page: filters.page,
        pageSize: filters.pageSize,
        search: normalizedSearch,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir
      }),
    placeholderData: keepPreviousData
  });
}

export function useClientsInfiniteQuery(filters: {
  pageSize: number;
  search: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  const normalizedFilters = {
    ...filters,
    search: filters.search.trim()
  };

  return useInfinitePagedQuery<Client, PaginatedResponse<Client>>({
    queryKey: ["clients", "infinite", normalizedFilters] as const,
    queryFn: (page) =>
      listClientsPageRequest({
        ...normalizedFilters,
        page,
        pageSize: normalizedFilters.pageSize
      })
  });
}

export function useClientDetailQuery(clientId: number | null) {
  return useQuery({
    queryKey: clientId ? clientDetailQueryKey(clientId) : ["clients", "detail", "empty"],
    queryFn: () => getClientRequest(clientId as number),
    enabled: clientId !== null
  });
}

export function useClientOrdersQuery(clientId: number | null) {
  return useQuery({
    queryKey: clientId ? clientOrdersQueryKey(clientId) : ["clients", "orders", "empty"],
    queryFn: () => listClientOrdersRequest(clientId as number),
    enabled: clientId !== null
  });
}

export function useCreateClientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ClientPayload) => createClientRequest(payload),
    onSuccess: (client) => {
      queryClient.setQueryData(clientDetailQueryKey(client.id), client);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    }
  });
}

export function useUpdateClientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clientId, payload }: { clientId: number; payload: ClientPayload }) => updateClientRequest(clientId, payload),
    onSuccess: (client) => {
      queryClient.setQueryData(clientDetailQueryKey(client.id), client);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    }
  });
}

export function useArchiveClientMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientId: number) => archiveClientRequest(clientId),
    onSuccess: (client) => {
      queryClient.setQueryData(clientDetailQueryKey(client.id), client);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}
