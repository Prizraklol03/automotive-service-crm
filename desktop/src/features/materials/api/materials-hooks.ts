import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteMaterialAttachmentRequest,
  createMaterialRequest,
  deleteMaterialRequest,
  downloadMaterialAttachmentRequest,
  getMaterialRequest,
  getMaterialsSummaryRequest,
  listMaterialsRequest,
  listMaterialsPageRequest,
  listMaterialAttachmentsRequest,
  uploadMaterialAttachmentRequest,
  updateMaterialRequest
} from "@/entities/material/api/material-api";
import type { Material, MaterialListSummary, MaterialPayload, MaterialsFilters } from "@/entities/material/model/types";
import { useInfinitePagedQuery } from "@/shared/hooks/use-infinite-paged-query";
import type { PaginatedResponse } from "@/shared/model/pagination";

export function materialsQueryKey(filters: MaterialsFilters = {}) {
  return ["materials", "list", filters.dateFrom ?? "", filters.dateTo ?? ""] as const;
}

export function materialDetailQueryKey(materialId: number) {
  return ["materials", "detail", materialId] as const;
}

export function materialAttachmentsQueryKey(materialId: number) {
  return ["materials", "attachments", materialId] as const;
}

export function useMaterialsQuery(filters: MaterialsFilters = {}) {
  return useQuery({
    queryKey: materialsQueryKey(filters),
    queryFn: () => listMaterialsRequest(filters)
  });
}

export function materialsPageQueryKey(filters: MaterialsFilters & { page: number; pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }) {
  return ["materials", "page", filters.dateFrom ?? "", filters.dateTo ?? "", filters.page, filters.pageSize, filters.sortBy ?? "", filters.sortDir ?? ""] as const;
}

export function materialsSummaryQueryKey(filters: MaterialsFilters = {}) {
  return ["materials", "summary", filters.dateFrom ?? "", filters.dateTo ?? ""] as const;
}

export function useMaterialsPageQuery(
  filters: MaterialsFilters & { page: number; pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }
) {
  return useQuery({
    queryKey: materialsPageQueryKey(filters),
    queryFn: () =>
      listMaterialsPageRequest({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        page: filters.page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir
      }),
    placeholderData: keepPreviousData
  });
}

export function useMaterialsInfiniteQuery(
  filters: MaterialsFilters & { pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }
) {
  return useInfinitePagedQuery<Material, PaginatedResponse<Material>>({
    queryKey: ["materials", "infinite", filters.dateFrom ?? "", filters.dateTo ?? "", filters.pageSize, filters.sortBy ?? "", filters.sortDir ?? ""] as const,
    queryFn: (page) =>
      listMaterialsPageRequest({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir
      })
  });
}

export function useMaterialsSummaryQuery(filters: MaterialsFilters = {}) {
  return useQuery<MaterialListSummary>({
    queryKey: materialsSummaryQueryKey(filters),
    queryFn: () => getMaterialsSummaryRequest(filters),
    placeholderData: keepPreviousData
  });
}

export function useMaterialDetailQuery(materialId: number | null) {
  return useQuery({
    queryKey: materialId ? materialDetailQueryKey(materialId) : ["materials", "detail", "empty"],
    queryFn: () => getMaterialRequest(materialId as number),
    enabled: materialId !== null,
    staleTime: 30_000
  });
}

export function useMaterialAttachmentsQuery(materialId: number | null, enabled = true) {
  return useQuery({
    queryKey: materialId ? materialAttachmentsQueryKey(materialId) : ["materials", "attachments", "empty"],
    queryFn: () => listMaterialAttachmentsRequest(materialId as number),
    enabled: materialId !== null && enabled,
    staleTime: 30_000
  });
}

export function useCreateMaterialMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MaterialPayload) => createMaterialRequest(payload),
    onSuccess: (material) => {
      queryClient.setQueryData(materialDetailQueryKey(material.id), material);
      void queryClient.invalidateQueries({ queryKey: ["materials"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });
}

export function useUpdateMaterialMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ materialId, payload }: { materialId: number; payload: MaterialPayload }) =>
      updateMaterialRequest(materialId, payload),
    onSuccess: (material) => {
      queryClient.setQueryData(materialDetailQueryKey(material.id), material);
      void queryClient.invalidateQueries({ queryKey: ["materials"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });
}

export function useDeleteMaterialMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (materialId: number) => deleteMaterialRequest(materialId),
    onSuccess: (_, materialId) => {
      queryClient.removeQueries({ queryKey: materialDetailQueryKey(materialId) });
      void queryClient.invalidateQueries({ queryKey: ["materials"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });
}

export function useUploadMaterialAttachmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ materialId, file }: { materialId: number; file: File }) => uploadMaterialAttachmentRequest(materialId, file),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: materialAttachmentsQueryKey(variables.materialId) });
      void queryClient.invalidateQueries({ queryKey: materialDetailQueryKey(variables.materialId) });
      void queryClient.invalidateQueries({ queryKey: ["materials"] });
    }
  });
}

export function useDeleteMaterialAttachmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ materialId, attachmentId }: { materialId: number; attachmentId: number }) =>
      deleteMaterialAttachmentRequest(materialId, attachmentId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: materialAttachmentsQueryKey(variables.materialId) });
      void queryClient.invalidateQueries({ queryKey: materialDetailQueryKey(variables.materialId) });
      void queryClient.invalidateQueries({ queryKey: ["materials"] });
    }
  });
}

export async function downloadMaterialAttachment(materialId: number, attachmentId: number) {
  return downloadMaterialAttachmentRequest(materialId, attachmentId);
}
