import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOrderDocumentRequest,
  ensureOrderDocumentRequest,
  generateDocumentPdfRequest,
  getDocumentRequest,
  listOrderDocumentsRequest,
  previewDocumentRequest,
  renderDocumentRequest,
  updateDocumentWorkDatesRequest
} from "@/entities/document/api/document-api";
import type { DocumentType, DocumentWorkDatesPayload } from "@/entities/document/model/types";

export function orderDocumentsQueryKey(orderId: number) {
  return ["documents", "order", orderId] as const;
}

export function documentDetailQueryKey(documentId: number) {
  return ["documents", "detail", documentId] as const;
}

export function documentPreviewQueryKey(documentId: number) {
  return ["documents", "preview", documentId] as const;
}

export function useOrderDocumentsQuery(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: orderId ? orderDocumentsQueryKey(orderId) : ["documents", "order", "empty"],
    queryFn: () => listOrderDocumentsRequest(orderId as number),
    enabled: orderId !== null && enabled
  });
}

export function useDocumentDetailQuery(documentId: number | null) {
  return useQuery({
    queryKey: documentId ? documentDetailQueryKey(documentId) : ["documents", "detail", "empty"],
    queryFn: () => getDocumentRequest(documentId as number),
    enabled: documentId !== null,
    staleTime: 30_000
  });
}

export function useDocumentPreviewQuery(documentId: number | null, enabled = true) {
  return useQuery({
    queryKey: documentId ? documentPreviewQueryKey(documentId) : ["documents", "preview", "empty"],
    queryFn: () => previewDocumentRequest(documentId as number),
    enabled: documentId !== null && enabled,
    staleTime: 30_000
  });
}

export function useCreateOrderDocumentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentType, orderId }: { documentType: DocumentType; orderId: number }) =>
      createOrderDocumentRequest(orderId, documentType),
    onSuccess: (document) => {
      queryClient.setQueryData(documentDetailQueryKey(document.id), document);
      void queryClient.invalidateQueries({ queryKey: orderDocumentsQueryKey(document.order_id) });
    }
  });
}

export function useEnsureOrderDocumentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentType, orderId }: { documentType: DocumentType; orderId: number }) =>
      ensureOrderDocumentRequest(orderId, documentType),
    onSuccess: (document) => {
      queryClient.setQueryData(documentDetailQueryKey(document.id), document);
      void queryClient.invalidateQueries({ queryKey: orderDocumentsQueryKey(document.order_id) });
    }
  });
}

export function useRenderDocumentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: number) => renderDocumentRequest(documentId),
    onSuccess: (document) => {
      queryClient.setQueryData(documentDetailQueryKey(document.id), document);
      void queryClient.invalidateQueries({ queryKey: orderDocumentsQueryKey(document.order_id) });
      void queryClient.invalidateQueries({ queryKey: documentPreviewQueryKey(document.id) });
    }
  });
}

export function useGenerateDocumentPdfMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: number) => generateDocumentPdfRequest(documentId),
    onSuccess: (document) => {
      queryClient.setQueryData(documentDetailQueryKey(document.id), document);
      void queryClient.invalidateQueries({ queryKey: orderDocumentsQueryKey(document.order_id) });
      void queryClient.invalidateQueries({ queryKey: documentPreviewQueryKey(document.id) });
    }
  });
}

export function useUpdateDocumentWorkDatesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, payload }: { documentId: number; payload: DocumentWorkDatesPayload }) =>
      updateDocumentWorkDatesRequest(documentId, payload),
    onSuccess: (document) => {
      queryClient.setQueryData(documentDetailQueryKey(document.id), document);
      void queryClient.invalidateQueries({ queryKey: orderDocumentsQueryKey(document.order_id) });
      void queryClient.invalidateQueries({ queryKey: documentPreviewQueryKey(document.id) });
    }
  });
}
