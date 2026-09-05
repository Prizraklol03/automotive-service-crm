import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  applyPresetRequest,
  createCustomFieldDefRequest,
  createOrderStatusRequest,
  deleteCustomFieldDefRequest,
  deleteOrderStatusRequest,
  getDocumentTemplatesRequest,
  getCustomFieldDefsRequest,
  getDocumentNumberingRequest,
  getModulesRequest,
  getOrderFieldValuesRequest,
  getOrderStatusesRequest,
  getPresetsRequest,
  getSettingsRequest,
  getUserPreferencesRequest,
  getVehicleCatalogStatusRequest,
  getVisualConfigRequest,
	  reorderOrderStatusesRequest,
	  reorderCustomFieldDefsRequest,
  syncVehicleCatalogRequest,
  uploadDocumentTemplateRequest,
  updateCustomFieldDefRequest,
  updateDocumentNumberingRequest,
  updateModulesRequest,
  updateOrderStatusRequest,
  updateUserPreferencesRequest,
  updateVisualConfigRequest,
  upsertOrderFieldValuesRequest,
} from "@/entities/settings/api/settings-api";
import type { DocumentTemplate, DocumentType } from "@/entities/document/model/types";
import { sortStatusesBySortOrder } from "@/entities/settings/model/types";
import type {
  CrmOrderStatus,
  CustomFieldDef,
  CustomFieldDefCreatePayload,
  CustomFieldDefUpdatePayload,
  ModulesConfig,
  OrderFieldValuesPayload,
  OrderStatusCreatePayload,
  OrderStatusUpdatePayload,
  UserPreferencesUpdatePayload,
  VisualConfig
} from "@/entities/settings/model/types";

export function useModulesQuery() {
  return useQuery({
    queryKey: ["settings", "modules"],
    queryFn: getModulesRequest,
    staleTime: 5 * 60 * 1000
  });
}

export function useUpdateModulesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ModulesConfig) => updateModulesRequest(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "modules"], result);
    }
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: ["settings", "app"],
    queryFn: getSettingsRequest
  });
}

export function useDocumentTemplatesQuery() {
  return useQuery({
    queryKey: ["settings", "document-templates"],
    queryFn: getDocumentTemplatesRequest,
    staleTime: 5 * 60 * 1000
  });
}

export function useDocumentNumberingQuery() {
  return useQuery({
    queryKey: ["settings", "document-numbering"],
    queryFn: getDocumentNumberingRequest
  });
}

export function useVehicleCatalogStatusQuery() {
  return useQuery({
    queryKey: ["settings", "vehicle-catalog"],
    queryFn: getVehicleCatalogStatusRequest
  });
}

export function useUserPreferencesQuery() {
  return useQuery({
    queryKey: ["settings", "me", "preferences"],
    queryFn: getUserPreferencesRequest
  });
}

export function useUpdateDocumentNumberingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (nextDocumentNumber: number) => updateDocumentNumberingRequest(nextDocumentNumber),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "document-numbering"], result);
      void queryClient.invalidateQueries({ queryKey: ["settings", "app"] });
    }
  });
}

export function useUploadDocumentTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentType, file }: { documentType: DocumentType; file: File }) =>
      uploadDocumentTemplateRequest(documentType, file),
    onSuccess: (result) => {
      queryClient.setQueryData<DocumentTemplate[]>(["settings", "document-templates"], (current) => {
        if (!current) {
          return [result];
        }
        const next = current.filter((item) => item.code !== result.code);
        next.push(result);
        return next.sort((left, right) => left.code.localeCompare(right.code));
      });
    }
  });
}

export function useSyncVehicleCatalogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncVehicleCatalogRequest,
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "vehicle-catalog"], {
        brand_count: result.brand_count,
        last_synced_at: result.completed_at,
        model_count: result.model_count,
        monthly_sync_enabled: result.monthly_sync_enabled,
        provider: result.provider,
        sync_interval_days: result.sync_interval_days
      });
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
      void queryClient.invalidateQueries({ queryKey: ["settings", "vehicle-catalog"] });
    }
  });
}

export function useUpdateUserPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UserPreferencesUpdatePayload) => updateUserPreferencesRequest(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "me", "preferences"], result);
    }
  });
}

export function useVisualConfigQuery() {
  return useQuery({
    queryKey: ["settings", "visual"],
    queryFn: getVisualConfigRequest,
    staleTime: 5 * 60 * 1000
  });
}

export function useUpdateVisualConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VisualConfig) => updateVisualConfigRequest(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "visual"], result);
    }
  });
}

// ── Order Statuses ─────────────────────────────────────────────────────────

export function useOrderStatusesQuery() {
  return useQuery({
    queryKey: ["settings", "statuses"],
    queryFn: getOrderStatusesRequest,
    select: (statuses) => sortStatusesBySortOrder(statuses),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OrderStatusCreatePayload) => createOrderStatusRequest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "statuses"] });
    },
  });
}

export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, payload }: { code: string; payload: OrderStatusUpdatePayload }) =>
      updateOrderStatusRequest(code, payload),
    onSuccess: (result) => {
      queryClient.setQueryData<CrmOrderStatus[]>(["settings", "statuses"], (old) =>
        sortStatusesBySortOrder(old ? old.map((s) => (s.code === result.code ? result : s)) : [result])
      );
    },
  });
}

export function useDeleteOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => deleteOrderStatusRequest(code),
    onSuccess: (_, code) => {
      queryClient.setQueryData<CrmOrderStatus[]>(["settings", "statuses"], (old) =>
        sortStatusesBySortOrder(old ? old.filter((s) => s.code !== code) : [])
      );
    },
  });
}

export function useReorderStatusesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (codes: string[]) => reorderOrderStatusesRequest(codes),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "statuses"], sortStatusesBySortOrder(result));
    },
  });
}

// ── Custom Fields ──────────────────────────────────────────────────────────

export function useCustomFieldDefsQuery() {
  return useQuery({
    queryKey: ["settings", "custom-fields"],
    queryFn: getCustomFieldDefsRequest,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCustomFieldDefMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomFieldDefCreatePayload) => createCustomFieldDefRequest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "custom-fields"] });
    },
  });
}

export function useUpdateCustomFieldDefMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: CustomFieldDefUpdatePayload }) =>
      updateCustomFieldDefRequest(key, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "custom-fields"] });
    },
  });
}

export function useDeleteCustomFieldDefMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteCustomFieldDefRequest(key),
    onSuccess: (_, key) => {
      queryClient.setQueryData<CustomFieldDef[]>(["settings", "custom-fields"], (old) =>
        old ? old.filter((d) => d.key !== key) : []
      );
    },
  });
	}

export function useReorderCustomFieldDefsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => reorderCustomFieldDefsRequest(keys),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "custom-fields"], result);
    },
  });
}

export function useOrderFieldValuesQuery(orderId: number | null | undefined) {
  return useQuery({
    queryKey: ["orders", orderId, "field-values"],
    queryFn: () => getOrderFieldValuesRequest(orderId!),
    enabled: !!orderId,
  });
}

export function useUpsertOrderFieldValuesMutation(orderId: number | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OrderFieldValuesPayload) => upsertOrderFieldValuesRequest(orderId!, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["orders", orderId, "field-values"], result);
    },
  });
}

// ── Presets ────────────────────────────────────────────────────────────────

export function usePresetsQuery() {
  return useQuery({
    queryKey: ["settings", "presets"],
    queryFn: getPresetsRequest,
    staleTime: Infinity,
  });
}

export function useApplyPresetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => applyPresetRequest(name),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings", "statuses"], result.statuses);
      void queryClient.invalidateQueries({ queryKey: ["settings", "statuses"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
