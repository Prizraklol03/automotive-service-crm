import { apiRequest } from "@/shared/api/client";
import type { PaginatedResponse } from "@/shared/model/pagination";
import type { Vehicle, VehicleDetail, VehiclePayload } from "@/entities/vehicle/model/types";

export function listVehiclesRequest() {
  return apiRequest<Vehicle[]>("/vehicles");
}

export type VehiclesPageRequest = {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export function listVehiclesPageRequest(filters: VehiclesPageRequest) {
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
  return apiRequest<PaginatedResponse<Vehicle>>(`/vehicles?${searchParams.toString()}`);
}

export function searchVehiclesRequest(query: string) {
  const params = new URLSearchParams({ q: query });
  return apiRequest<Vehicle[]>(`/vehicles/search?${params.toString()}`);
}

export function getVehicleRequest(vehicleId: number) {
  return apiRequest<VehicleDetail>(`/vehicles/${vehicleId}`);
}

export function createVehicleRequest(payload: VehiclePayload) {
  return apiRequest<Vehicle>("/vehicles", {
    method: "POST",
    body: payload
  });
}

export function updateVehicleRequest(vehicleId: number, payload: VehiclePayload) {
  return apiRequest<Vehicle>(`/vehicles/${vehicleId}`, {
    method: "PUT",
    body: payload
  });
}

export function archiveVehicleRequest(vehicleId: number) {
  return apiRequest<Vehicle>(`/vehicles/${vehicleId}/archive`, {
    method: "PATCH"
  });
}
