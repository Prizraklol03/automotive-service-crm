import { apiRequest } from "@/shared/api/client";
import type { PaginatedResponse } from "@/shared/model/pagination";
import type { Client, ClientDetail, ClientOrderHistory, ClientPayload } from "@/entities/client/model/types";

export function listClientsRequest() {
  return apiRequest<Client[]>("/clients");
}

export type ClientsPageRequest = {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export function listClientsPageRequest(filters: ClientsPageRequest) {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize)
  });
  if (filters.search?.trim()) {
    searchParams.set("q", filters.search.trim());
  }
  if (filters.sortBy) {
    searchParams.set("sort_by", filters.sortBy);
  }
  if (filters.sortDir) {
    searchParams.set("sort_dir", filters.sortDir);
  }
  return apiRequest<PaginatedResponse<Client>>(`/clients?${searchParams.toString()}`);
}

export function searchClientsRequest(query: string) {
  const params = new URLSearchParams({ q: query });
  return apiRequest<Client[]>(`/clients/search?${params.toString()}`);
}

export function getClientRequest(clientId: number) {
  return apiRequest<ClientDetail>(`/clients/${clientId}`);
}

export function listClientOrdersRequest(clientId: number) {
  return apiRequest<ClientOrderHistory>(`/clients/${clientId}/orders`);
}

export function createClientRequest(payload: ClientPayload) {
  return apiRequest<Client>("/clients", {
    method: "POST",
    body: payload
  });
}

export function updateClientRequest(clientId: number, payload: ClientPayload) {
  return apiRequest<Client>(`/clients/${clientId}`, {
    method: "PUT",
    body: payload
  });
}

export function archiveClientRequest(clientId: number) {
  return apiRequest<Client>(`/clients/${clientId}/archive`, {
    method: "PATCH"
  });
}
