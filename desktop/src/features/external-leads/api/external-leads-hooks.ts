import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getExternalLeadRequest,
  getExternalLeadsSummaryRequest,
  listExternalLeadsRequest,
  updateExternalLeadStatusRequest
} from "@/entities/external-lead/api/external-lead-api";
import type { ExternalLeadStatus, ExternalLeadSummary } from "@/entities/external-lead/model/types";

export function externalLeadSummaryQueryKey() {
  return ["external-leads", "summary"] as const;
}

export function externalLeadsListQueryKey(status: ExternalLeadStatus | null, search: string) {
  return ["external-leads", "list", status ?? "all", search] as const;
}

export function externalLeadDetailQueryKey(leadId: number) {
  return ["external-leads", "detail", leadId] as const;
}

export function useExternalLeadSummaryQuery() {
  return useQuery<ExternalLeadSummary>({
    queryKey: externalLeadSummaryQueryKey(),
    queryFn: getExternalLeadsSummaryRequest,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    staleTime: 30_000
  });
}

export function useExternalLeadsListQuery({
  search,
  status
}: {
  search: string;
  status: ExternalLeadStatus | null;
}) {
  return useQuery({
    queryKey: externalLeadsListQueryKey(status, search),
    queryFn: () => listExternalLeadsRequest({ search, status }),
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });
}

export function useExternalLeadDetailQuery(leadId: number | null) {
  return useQuery({
    queryKey: leadId ? externalLeadDetailQueryKey(leadId) : ["external-leads", "detail", "empty"],
    queryFn: () => getExternalLeadRequest(leadId as number),
    enabled: leadId !== null
  });
}

export function useUpdateExternalLeadStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, status }: { leadId: number; status: ExternalLeadStatus }) =>
      updateExternalLeadStatusRequest(leadId, status),
    onSuccess: (lead) => {
      queryClient.setQueryData(externalLeadDetailQueryKey(lead.id), lead);
      void queryClient.invalidateQueries({ queryKey: ["external-leads"] });
    }
  });
}
