import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createServiceCategoryRequest,
  createServiceRequest,
  getServiceCategoryRequest,
  getServiceRequest,
  listServiceCategoriesRequest,
  listServicesRequest,
  reorderServiceCategoriesRequest,
  reorderServicesRequest,
  updateServiceCategoryRequest,
  updateServiceRequest
} from "@/entities/service/api/service-api";
import type {
  ServiceCatalogPayload,
  ServiceCatalogReorderPayload,
  ServiceCategoryPayload,
  ServiceCategoryReorderPayload
} from "@/entities/service/model/types";

export function servicesListQueryKey() {
  return ["services", "list"] as const;
}

export function serviceDetailQueryKey(serviceId: number) {
  return ["services", "detail", serviceId] as const;
}

export function serviceCategoriesQueryKey() {
  return ["services", "categories"] as const;
}

export function serviceCategoryDetailQueryKey(categoryId: number) {
  return ["services", "categories", categoryId] as const;
}

export function useServicesListQuery() {
  return useQuery({
    queryKey: servicesListQueryKey(),
    queryFn: listServicesRequest
  });
}

export function useServiceDetailQuery(serviceId: number | null) {
  return useQuery({
    queryKey: serviceId ? serviceDetailQueryKey(serviceId) : ["services", "detail", "empty"],
    queryFn: () => getServiceRequest(serviceId as number),
    enabled: serviceId !== null
  });
}

export function useServiceCategoriesQuery() {
  return useQuery({
    queryKey: serviceCategoriesQueryKey(),
    queryFn: listServiceCategoriesRequest
  });
}

export function useServiceCategoryDetailQuery(categoryId: number | null) {
  return useQuery({
    queryKey: categoryId ? serviceCategoryDetailQueryKey(categoryId) : ["services", "categories", "empty"],
    queryFn: () => getServiceCategoryRequest(categoryId as number),
    enabled: categoryId !== null
  });
}

export function useCreateServiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ServiceCatalogPayload) => createServiceRequest(payload),
    onSuccess: (service) => {
      queryClient.setQueryData(serviceDetailQueryKey(service.id), service);
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });
}

export function useUpdateServiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, serviceId }: { payload: ServiceCatalogPayload; serviceId: number }) =>
      updateServiceRequest(serviceId, payload),
    onSuccess: (service) => {
      queryClient.setQueryData(serviceDetailQueryKey(service.id), service);
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });
}

export function useReorderServicesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ServiceCatalogReorderPayload) => reorderServicesRequest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });
}

export function useReorderServiceCategoriesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ServiceCategoryReorderPayload) => reorderServiceCategoriesRequest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });
}

export function useCreateServiceCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ServiceCategoryPayload) => createServiceCategoryRequest(payload),
    onSuccess: (category) => {
      queryClient.setQueryData(serviceCategoryDetailQueryKey(category.id), category);
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });
}

export function useUpdateServiceCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, payload }: { categoryId: number; payload: ServiceCategoryPayload }) =>
      updateServiceCategoryRequest(categoryId, payload),
    onSuccess: (category) => {
      queryClient.setQueryData(serviceCategoryDetailQueryKey(category.id), category);
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });
}
