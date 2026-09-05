import { apiDownload, apiRequest } from "@/shared/api/client";
import type { PaginatedResponse } from "@/shared/model/pagination";
import type { Material, MaterialAttachment, MaterialListSummary, MaterialPayload, MaterialsFilters } from "@/entities/material/model/types";

export function listMaterialsRequest(filters: MaterialsFilters = {}) {
  const searchParams = new URLSearchParams();
  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }

  const query = searchParams.toString();
  return apiRequest<Material[]>(query ? `/materials?${query}` : "/materials");
}

export type MaterialsPageRequest = MaterialsFilters & {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export function listMaterialsPageRequest(filters: MaterialsPageRequest) {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize)
  });
  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }
  if (filters.sortBy) {
    searchParams.set("sort_by", filters.sortBy);
  }
  if (filters.sortDir) {
    searchParams.set("sort_dir", filters.sortDir);
  }
  return apiRequest<PaginatedResponse<Material>>(`/materials?${searchParams.toString()}`);
}

export function getMaterialsSummaryRequest(filters: MaterialsFilters = {}) {
  const searchParams = new URLSearchParams();
  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }
  const query = searchParams.toString();
  return apiRequest<MaterialListSummary>(query ? `/materials/summary?${query}` : "/materials/summary");
}

export function getMaterialRequest(materialId: number) {
  return apiRequest<Material>(`/materials/${materialId}`);
}

export function createMaterialRequest(payload: MaterialPayload) {
  return apiRequest<Material>("/materials", {
    method: "POST",
    body: payload
  });
}

export function updateMaterialRequest(materialId: number, payload: MaterialPayload) {
  return apiRequest<Material>(`/materials/${materialId}`, {
    method: "PATCH",
    body: payload
  });
}

export function deleteMaterialRequest(materialId: number) {
  return apiRequest<void>(`/materials/${materialId}`, {
    method: "DELETE"
  });
}

export function listMaterialAttachmentsRequest(materialId: number) {
  return apiRequest<MaterialAttachment[]>(`/materials/${materialId}/attachments`);
}

export function uploadMaterialAttachmentRequest(materialId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<MaterialAttachment>(`/materials/${materialId}/attachments`, {
    method: "POST",
    body: formData
  });
}

export function deleteMaterialAttachmentRequest(materialId: number, attachmentId: number) {
  return apiRequest<void>(`/materials/${materialId}/attachments/${attachmentId}`, {
    method: "DELETE"
  });
}

export async function downloadMaterialAttachmentRequest(materialId: number, attachmentId: number) {
  return apiDownload(`/materials/${materialId}/attachments/${attachmentId}/file`);
}
