import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveVehicleRequest,
  createVehicleRequest,
  getVehicleRequest,
  listVehiclesPageRequest,
  listVehiclesRequest,
  searchVehiclesRequest,
  updateVehicleRequest
} from "@/entities/vehicle/api/vehicle-api";
import type { Vehicle, VehiclePayload } from "@/entities/vehicle/model/types";
import { listCarBrandsRequest, listCarModelsByBrandRequest } from "@/entities/reference/api/reference-api";
import { useInfinitePagedQuery } from "@/shared/hooks/use-infinite-paged-query";
import type { PaginatedResponse } from "@/shared/model/pagination";

export function vehiclesListQueryKey(search: string) {
  return ["vehicles", "list", search] as const;
}

export function vehicleDetailQueryKey(vehicleId: number) {
  return ["vehicles", "detail", vehicleId] as const;
}

export function useVehiclesListQuery(search: string, enabled = true) {
  const normalizedSearch = search.trim();

  return useQuery({
    queryKey: vehiclesListQueryKey(normalizedSearch),
    queryFn: () => (normalizedSearch ? searchVehiclesRequest(normalizedSearch) : listVehiclesRequest()),
    enabled
  });
}

export function useClientVehiclesQuery(clientId: number | null, enabled = true) {
  return useQuery({
    queryKey: clientId ? ["vehicles", "related", clientId] : ["vehicles", "related", "empty"],
    queryFn: listVehiclesRequest,
    enabled: enabled && clientId !== null,
    staleTime: 30_000
  });
}

export function useVehiclesPageQuery(filters: {
  page: number;
  pageSize: number;
  search: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  const normalizedSearch = filters.search.trim();

  return useQuery({
    queryKey: ["vehicles", "page", { ...filters, search: normalizedSearch }],
    queryFn: () =>
      listVehiclesPageRequest({
        page: filters.page,
        pageSize: filters.pageSize,
        search: normalizedSearch,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir
      }),
    placeholderData: keepPreviousData
  });
}

export function useVehiclesInfiniteQuery(filters: {
  pageSize: number;
  search: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  const normalizedFilters = {
    ...filters,
    search: filters.search.trim()
  };

  return useInfinitePagedQuery<Vehicle, PaginatedResponse<Vehicle>>({
    queryKey: ["vehicles", "infinite", normalizedFilters] as const,
    queryFn: (page) =>
      listVehiclesPageRequest({
        ...normalizedFilters,
        page,
        pageSize: normalizedFilters.pageSize
      })
  });
}

export function useVehicleDetailQuery(vehicleId: number | null) {
  return useQuery({
    queryKey: vehicleId ? vehicleDetailQueryKey(vehicleId) : ["vehicles", "detail", "empty"],
    queryFn: () => getVehicleRequest(vehicleId as number),
    enabled: vehicleId !== null
  });
}

export function useCarBrandsQuery() {
  return useQuery({
    queryKey: ["reference", "car-brands"],
    queryFn: listCarBrandsRequest
  });
}

export function useCarModelsByBrandQuery(brandId: number | null) {
  return useQuery({
    queryKey: brandId ? ["reference", "car-models", brandId] : ["reference", "car-models", "empty"],
    queryFn: () => listCarModelsByBrandRequest(brandId as number),
    enabled: brandId !== null
  });
}

export function useCreateVehicleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: VehiclePayload) => createVehicleRequest(payload),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleDetailQueryKey(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    }
  });
}

export function useUpdateVehicleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, vehicleId }: { payload: VehiclePayload; vehicleId: number }) => updateVehicleRequest(vehicleId, payload),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleDetailQueryKey(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}

export function useArchiveVehicleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vehicleId: number) => archiveVehicleRequest(vehicleId),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleDetailQueryKey(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });
}
