import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  completeInspectionSessionRequest,
  confirmInspectionSessionRequest,
  createInspectionMarkRequest,
  deleteInspectionGeneralPhotoRequest,
  deleteInspectionMarkPhotoRequest,
  deleteInspectionMarkRequest,
  fetchInspectionGeneralPhotoObjectUrl,
  fetchInspectionMarkPhotoObjectUrl,
  generateInspectionActRequest,
  getCurrentInspectionSessionRequest,
  getInspectionExportPreviewRequest,
  getInspectionHistoryRequest,
  lockInspectionSessionRequest,
  listInspectionMarksRequest,
  reopenInspectionSessionRequest,
  reorderInspectionMarksRequest,
  startInspectionSessionRequest,
  updateInspectionMarkRequest,
  updateInspectionSessionRequest,
  uploadInspectionGeneralPhotosRequest,
  uploadInspectionMarkPhotosRequest,
} from "@/features/inspection/api/inspection-api";
import type {
  InspectionMarkPatchPayload,
  InspectionMarkPayload,
  InspectionMarkReorderPayload,
  InspectionSessionPatchPayload,
} from "@/features/inspection/model/types";
import { orderDetailQueryKey } from "@/features/orders/api/orders-hooks";

export function inspectionCurrentSessionKey(orderId: number) {
  return ["orders", orderId, "inspection", "current"] as const;
}

export function inspectionMarksKey(sessionId: number) {
  return ["inspection-sessions", sessionId, "marks"] as const;
}

export function inspectionHistoryKey(sessionId: number) {
  return ["inspection-sessions", sessionId, "history"] as const;
}

export function inspectionExportPreviewKey(sessionId: number) {
  return ["inspection-sessions", sessionId, "export-preview"] as const;
}

export function useCurrentInspectionSessionQuery(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: orderId ? inspectionCurrentSessionKey(orderId) : ["orders", "inspection", "empty"],
    queryFn: () => getCurrentInspectionSessionRequest(orderId!),
    enabled: orderId != null && enabled,
    staleTime: 15_000,
  });
}

export function useInspectionMarksQuery(sessionId: number | null) {
  return useQuery({
    queryKey: sessionId ? inspectionMarksKey(sessionId) : ["inspection-sessions", "marks", "empty"],
    queryFn: () => listInspectionMarksRequest(sessionId!),
    enabled: sessionId != null,
  });
}

export function useInspectionHistoryQuery(sessionId: number | null) {
  return useQuery({
    queryKey: sessionId ? inspectionHistoryKey(sessionId) : ["inspection-sessions", "history", "empty"],
    queryFn: () => getInspectionHistoryRequest(sessionId!),
    enabled: sessionId != null,
    staleTime: 10_000,
  });
}

export function useInspectionExportPreviewQuery(sessionId: number | null) {
  return useQuery({
    queryKey: sessionId ? inspectionExportPreviewKey(sessionId) : ["inspection-sessions", "export-preview", "empty"],
    queryFn: () => getInspectionExportPreviewRequest(sessionId!),
    enabled: sessionId != null,
  });
}

function invalidateInspection(queryClient: ReturnType<typeof useQueryClient>, orderId: number, sessionId?: number | null) {
  void queryClient.invalidateQueries({ queryKey: inspectionCurrentSessionKey(orderId) });
  void queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderId) });
  if (sessionId != null) {
    void queryClient.invalidateQueries({ queryKey: inspectionMarksKey(sessionId) });
    void queryClient.invalidateQueries({ queryKey: inspectionHistoryKey(sessionId) });
    void queryClient.invalidateQueries({ queryKey: inspectionExportPreviewKey(sessionId) });
  }
}

export function useStartInspectionSessionMutation(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startInspectionSessionRequest(orderId),
    onSuccess: (session) => {
      queryClient.setQueryData(inspectionCurrentSessionKey(orderId), session);
      invalidateInspection(queryClient, orderId, session.id);
    },
  });
}

export function useUpdateInspectionSessionMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InspectionSessionPatchPayload) => updateInspectionSessionRequest(sessionId, payload),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useCompleteInspectionSessionMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeInspectionSessionRequest(sessionId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useConfirmInspectionSessionMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => confirmInspectionSessionRequest(sessionId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useLockInspectionSessionMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => lockInspectionSessionRequest(sessionId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useReopenInspectionSessionMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reopenInspectionSessionRequest(sessionId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useCreateInspectionMarkMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InspectionMarkPayload) => createInspectionMarkRequest(sessionId, payload),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useUpdateInspectionMarkMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ markId, payload }: { markId: number; payload: InspectionMarkPatchPayload }) =>
      updateInspectionMarkRequest(markId, payload),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useDeleteInspectionMarkMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (markId: number) => deleteInspectionMarkRequest(markId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useReorderInspectionMarksMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InspectionMarkReorderPayload) => reorderInspectionMarksRequest(payload),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useUploadInspectionMarkPhotosMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ markId, files }: { markId: number; files: File[] }) => uploadInspectionMarkPhotosRequest(markId, files),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useDeleteInspectionMarkPhotoMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => deleteInspectionMarkPhotoRequest(photoId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useUploadInspectionGeneralPhotosMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => uploadInspectionGeneralPhotosRequest(sessionId, files),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useDeleteInspectionGeneralPhotoMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => deleteInspectionGeneralPhotoRequest(photoId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

export function useGenerateInspectionActMutation(orderId: number, sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generateInspectionActRequest(sessionId),
    onSuccess: () => invalidateInspection(queryClient, orderId, sessionId),
  });
}

function useBlobObjectUrl(load: (() => Promise<string>) | null) {
  const [data, setData] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(Boolean(load));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!load) {
      setData(undefined);
      setIsPending(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    let objectUrl: string | null = null;
    setData(undefined);
    setError(null);
    setIsPending(true);

    void load()
      .then((url) => {
        if (isCancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setData(url);
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err : new Error("Не удалось загрузить изображение"));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsPending(false);
        }
      });

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [load]);

  return { data, error, isPending };
}

export function useInspectionMarkPhotoObjectUrl(sessionId: number | null, markId: number | null, photoId: number | null) {
  return useBlobObjectUrl(
    sessionId != null && markId != null && photoId != null
      ? () => fetchInspectionMarkPhotoObjectUrl(sessionId, markId, photoId)
      : null,
  );
}

export function useInspectionGeneralPhotoObjectUrl(sessionId: number | null, photoId: number | null) {
  return useBlobObjectUrl(sessionId != null && photoId != null ? () => fetchInspectionGeneralPhotoObjectUrl(sessionId, photoId) : null);
}
