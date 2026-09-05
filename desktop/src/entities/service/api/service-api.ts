import { apiRequest } from "@/shared/api/client";
import type {
  ServiceCatalogItem,
  ServiceCatalogPayload,
  ServiceCatalogReorderPayload,
  ServiceCategory,
  ServiceCategoryPayload,
  ServiceCategoryReorderPayload
} from "@/entities/service/model/types";

export function listServicesRequest() {
  return apiRequest<ServiceCatalogItem[]>("/services");
}

export function listServicesByCategoryRequest(categoryId: number) {
  return apiRequest<ServiceCatalogItem[]>(`/services/by-category/${categoryId}`);
}

export function getServiceRequest(serviceId: number) {
  return apiRequest<ServiceCatalogItem>(`/services/${serviceId}`);
}

export function createServiceRequest(payload: ServiceCatalogPayload) {
  return apiRequest<ServiceCatalogItem>("/services", {
    method: "POST",
    body: payload
  });
}

export function updateServiceRequest(serviceId: number, payload: ServiceCatalogPayload) {
  return apiRequest<ServiceCatalogItem>(`/services/${serviceId}`, {
    method: "PUT",
    body: payload
  });
}

export function reorderServicesRequest(payload: ServiceCatalogReorderPayload) {
  return apiRequest<ServiceCatalogItem[]>("/services/reorder", {
    method: "PUT",
    body: payload
  });
}

export function listServiceCategoriesRequest() {
  return apiRequest<ServiceCategory[]>("/service-categories");
}

export function getServiceCategoryRequest(categoryId: number) {
  return apiRequest<ServiceCategory>(`/service-categories/${categoryId}`);
}

export function createServiceCategoryRequest(payload: ServiceCategoryPayload) {
  return apiRequest<ServiceCategory>("/service-categories", {
    method: "POST",
    body: payload
  });
}

export function updateServiceCategoryRequest(categoryId: number, payload: ServiceCategoryPayload) {
  return apiRequest<ServiceCategory>(`/service-categories/${categoryId}`, {
    method: "PUT",
    body: payload
  });
}

export function reorderServiceCategoriesRequest(payload: ServiceCategoryReorderPayload) {
  return apiRequest<ServiceCategory[]>("/service-categories/reorder", {
    method: "PUT",
    body: payload
  });
}
