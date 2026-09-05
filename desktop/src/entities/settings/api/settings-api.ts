import { apiRequest } from "@/shared/api/client";
import type { DocumentTemplate, DocumentType } from "@/entities/document/model/types";
import type {
  AppSettings,
  CrmOrderStatus,
  CustomFieldDef,
  CustomFieldDefCreatePayload,
  CustomFieldDefUpdatePayload,
  DocumentNumbering,
  ModulesConfig,
  OrderFieldValue,
  OrderFieldValuesPayload,
  OrderStatusCreatePayload,
  OrderStatusUpdatePayload,
  PresetApplyResult,
  StatusPreset,
  UserPreferences,
  UserPreferencesUpdatePayload,
  VehicleCatalogStatus,
  VehicleCatalogSyncResult,
  VisualConfig
} from "@/entities/settings/model/types";

export function getSettingsRequest() {
  return apiRequest<AppSettings>("/settings");
}

export function getDocumentTemplatesRequest() {
  return apiRequest<DocumentTemplate[]>("/settings/document-templates");
}

export function uploadDocumentTemplateRequest(documentType: DocumentType, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<DocumentTemplate>(`/settings/document-templates/${documentType}`, {
    method: "POST",
    body: formData
  });
}

export function getDocumentNumberingRequest() {
  return apiRequest<DocumentNumbering>("/settings/document-numbering");
}

export function updateDocumentNumberingRequest(nextDocumentNumber: number) {
  return apiRequest<DocumentNumbering>("/settings/document-numbering", {
    method: "PUT",
    body: { next_document_number: nextDocumentNumber }
  });
}

export function getVehicleCatalogStatusRequest() {
  return apiRequest<VehicleCatalogStatus>("/settings/vehicle-catalog");
}

export function syncVehicleCatalogRequest() {
  return apiRequest<VehicleCatalogSyncResult>("/settings/vehicle-catalog/sync", {
    method: "POST"
  });
}

export function getModulesRequest() {
  return apiRequest<ModulesConfig>("/settings/modules");
}

export function updateModulesRequest(payload: ModulesConfig) {
  return apiRequest<ModulesConfig>("/settings/modules", {
    method: "PUT",
    body: payload
  });
}

export function getUserPreferencesRequest() {
  return apiRequest<UserPreferences>("/settings/me/preferences");
}

export function updateUserPreferencesRequest(payload: UserPreferencesUpdatePayload) {
  return apiRequest<UserPreferences>("/settings/me/preferences", {
    method: "PUT",
    body: payload
  });
}

export function getVisualConfigRequest() {
  return apiRequest<VisualConfig>("/settings/visual");
}

export function updateVisualConfigRequest(payload: VisualConfig) {
  return apiRequest<VisualConfig>("/settings/visual", { method: "PUT", body: payload });
}

// ── Order Statuses ─────────────────────────────────────────────────────────

export function getOrderStatusesRequest() {
  return apiRequest<CrmOrderStatus[]>("/settings/statuses");
}

export function createOrderStatusRequest(payload: OrderStatusCreatePayload) {
  return apiRequest<CrmOrderStatus>("/settings/statuses", { method: "POST", body: payload });
}

export function updateOrderStatusRequest(code: string, payload: OrderStatusUpdatePayload) {
  return apiRequest<CrmOrderStatus>(`/settings/statuses/${code}`, { method: "PATCH", body: payload });
}

export function deleteOrderStatusRequest(code: string) {
  return apiRequest<void>(`/settings/statuses/${code}`, { method: "DELETE" });
}

export function reorderOrderStatusesRequest(codes: string[]) {
  return apiRequest<CrmOrderStatus[]>("/settings/statuses/reorder", { method: "POST", body: { codes } });
}

// ── Custom Fields ──────────────────────────────────────────────────────────

export function getCustomFieldDefsRequest() {
  return apiRequest<CustomFieldDef[]>("/settings/custom-fields");
}

export function createCustomFieldDefRequest(payload: CustomFieldDefCreatePayload) {
  return apiRequest<CustomFieldDef>("/settings/custom-fields", { method: "POST", body: payload });
}

export function updateCustomFieldDefRequest(key: string, payload: CustomFieldDefUpdatePayload) {
  return apiRequest<CustomFieldDef>(`/settings/custom-fields/${key}`, { method: "PATCH", body: payload });
}

export function deleteCustomFieldDefRequest(key: string) {
  return apiRequest<void>(`/settings/custom-fields/${key}`, { method: "DELETE" });
}

export function reorderCustomFieldDefsRequest(keys: string[]) {
  return apiRequest<CustomFieldDef[]>("/settings/custom-fields/reorder", { method: "POST", body: { keys } });
}

export function getOrderFieldValuesRequest(orderId: number) {
  return apiRequest<OrderFieldValue[]>(`/orders/${orderId}/field-values`);
}

export function upsertOrderFieldValuesRequest(orderId: number, payload: OrderFieldValuesPayload) {
  return apiRequest<OrderFieldValue[]>(`/orders/${orderId}/field-values`, { method: "PUT", body: payload });
}

// ── Presets ────────────────────────────────────────────────────────────────

export function getPresetsRequest() {
  return apiRequest<StatusPreset[]>("/settings/presets");
}

export function applyPresetRequest(name: string) {
  return apiRequest<PresetApplyResult>(`/settings/presets/${name}/apply`, { method: "POST" });
}
