import { apiRequest } from "@/shared/api/client";
import { env } from "@/shared/config/env";
import { readAuthSession } from "@/shared/api/auth-storage";
import type {
  InspectionActGenerateResult,
  InspectionExportPreview,
  InspectionGeneralPhoto,
  InspectionHistory,
  InspectionMark,
  InspectionMarkPatchPayload,
  InspectionMarkPayload,
  InspectionMarkPhoto,
  InspectionMarkReorderPayload,
  InspectionSession,
  InspectionSessionDetail,
  InspectionSessionPatchPayload,
} from "@/features/inspection/model/types";

export function getCurrentInspectionSessionRequest(orderId: number) {
  return apiRequest<InspectionSessionDetail | null>(`/orders/${orderId}/inspection-sessions/current`);
}

export function startInspectionSessionRequest(orderId: number) {
  return apiRequest<InspectionSessionDetail>(`/orders/${orderId}/inspection-sessions/start`, { method: "POST" });
}

export function updateInspectionSessionRequest(sessionId: number, payload: InspectionSessionPatchPayload) {
  return apiRequest<InspectionSession>(`/inspection-sessions/${sessionId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function completeInspectionSessionRequest(sessionId: number) {
  return apiRequest<InspectionSession>(`/inspection-sessions/${sessionId}/complete`, { method: "POST" });
}

export function confirmInspectionSessionRequest(sessionId: number) {
  return apiRequest<InspectionSession>(`/inspection-sessions/${sessionId}/confirm`, { method: "POST" });
}

export function lockInspectionSessionRequest(sessionId: number) {
  return apiRequest<InspectionSession>(`/inspection-sessions/${sessionId}/lock`, { method: "POST" });
}

export function reopenInspectionSessionRequest(sessionId: number) {
  return apiRequest<InspectionSession>(`/inspection-sessions/${sessionId}/reopen`, { method: "POST" });
}

export function listInspectionMarksRequest(sessionId: number) {
  return apiRequest<InspectionMark[]>(`/inspection-sessions/${sessionId}/marks`);
}

export function createInspectionMarkRequest(sessionId: number, payload: InspectionMarkPayload) {
  return apiRequest<InspectionMark>(`/inspection-sessions/${sessionId}/marks`, {
    method: "POST",
    body: payload,
  });
}

export function getInspectionMarkRequest(markId: number) {
  return apiRequest<InspectionMark>(`/inspection-marks/${markId}`);
}

export function updateInspectionMarkRequest(markId: number, payload: InspectionMarkPatchPayload) {
  return apiRequest<InspectionMark>(`/inspection-marks/${markId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteInspectionMarkRequest(markId: number) {
  return apiRequest<void>(`/inspection-marks/${markId}`, { method: "DELETE" });
}

export function reorderInspectionMarksRequest(payload: InspectionMarkReorderPayload) {
  return apiRequest<InspectionMark[]>(`/inspection-marks/reorder`, {
    method: "POST",
    body: payload,
  });
}

export function uploadInspectionMarkPhotosRequest(markId: number, files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiRequest<InspectionMarkPhoto[]>(`/inspection-marks/${markId}/photos`, {
    method: "POST",
    body: formData,
  });
}

export function deleteInspectionMarkPhotoRequest(photoId: number) {
  return apiRequest<void>(`/inspection-mark-photos/${photoId}`, { method: "DELETE" });
}

export function uploadInspectionGeneralPhotosRequest(sessionId: number, files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiRequest<InspectionGeneralPhoto[]>(`/inspection-sessions/${sessionId}/general-photos`, {
    method: "POST",
    body: formData,
  });
}

export function deleteInspectionGeneralPhotoRequest(photoId: number) {
  return apiRequest<void>(`/inspection-general-photos/${photoId}`, { method: "DELETE" });
}

export function getInspectionExportPreviewRequest(sessionId: number) {
  return apiRequest<InspectionExportPreview>(`/inspection-sessions/${sessionId}/export-preview`);
}

export function generateInspectionActRequest(sessionId: number) {
  return apiRequest<InspectionActGenerateResult>(`/inspection-sessions/${sessionId}/generate-act`, {
    method: "POST",
  });
}

export function getInspectionHistoryRequest(sessionId: number) {
  return apiRequest<InspectionHistory>(`/inspection-sessions/${sessionId}/history`);
}

async function fetchBlobObjectUrl(path: string): Promise<string> {
  const session = readAuthSession();
  const headers: HeadersInit = {};
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  const response = await fetch(`${env.apiBaseUrl}${path}`, { headers });
  if (!response.ok) {
    throw new Error("Не удалось загрузить изображение");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function fetchInspectionMarkPhotoObjectUrl(sessionId: number, markId: number, photoId: number) {
  return fetchBlobObjectUrl(`/inspection-sessions/${sessionId}/marks/${markId}/photos/${photoId}/file`);
}

export function fetchInspectionGeneralPhotoObjectUrl(sessionId: number, photoId: number) {
  return fetchBlobObjectUrl(`/inspection-sessions/${sessionId}/general-photos/${photoId}/file`);
}
