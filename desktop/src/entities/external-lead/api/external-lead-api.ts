import { apiRequest } from "@/shared/api/client";
import type { ExternalLeadDetail, ExternalLeadListItem, ExternalLeadStatus, ExternalLeadSummary } from "@/entities/external-lead/model/types";

type ExternalLeadListParams = {
  search?: string;
  status?: ExternalLeadStatus | null;
};

export function getExternalLeadsSummaryRequest() {
  return apiRequest<ExternalLeadSummary>("/integrations/external-leads/summary");
}

export function listExternalLeadsRequest(params: ExternalLeadListParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }
  const suffix = searchParams.toString();
  return apiRequest<ExternalLeadListItem[]>(`/integrations/external-leads${suffix ? `?${suffix}` : ""}`);
}

export function getExternalLeadRequest(leadId: number) {
  return apiRequest<ExternalLeadDetail>(`/integrations/external-leads/${leadId}`);
}

export function updateExternalLeadStatusRequest(leadId: number, status: ExternalLeadStatus) {
  return apiRequest<ExternalLeadDetail>(`/integrations/external-leads/${leadId}`, {
    method: "PATCH",
    body: { status }
  });
}
