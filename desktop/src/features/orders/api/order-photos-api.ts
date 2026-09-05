import { apiRequest } from "@/shared/api/client";
import { env } from "@/shared/config/env";
import { readAuthSession } from "@/shared/api/auth-storage";
import type { OrderPhoto, OrderShareInfo, PhotoStage, PublicOrderPhoto } from "@/features/orders/model/photo-types";

export type OrderPhotosUploadResult = {
  failed: Array<{ error: Error; fileName: string }>;
  uploaded: OrderPhoto[];
};

export type OrderPhotoUploadProgress =
  | { file: File; index: number; status: "uploading" }
  | { file: File; index: number; photos: OrderPhoto[]; status: "uploaded" }
  | { error: Error; file: File; index: number; status: "failed" };

export function listOrderPhotosRequest(orderId: number) {
  return apiRequest<OrderPhoto[]>(`/orders/${orderId}/photos`);
}

export async function uploadOrderPhotosRequest(
  orderId: number,
  stage: PhotoStage,
  files: File[],
  onProgress?: (progress: OrderPhotoUploadProgress) => void
): Promise<OrderPhotosUploadResult> {
  const uploaded: OrderPhoto[] = [];
  const failed: OrderPhotosUploadResult["failed"] = [];

  for (const [index, file] of files.entries()) {
    const formData = new FormData();
    formData.append("stage", stage);
    formData.append("files", file);
    onProgress?.({ file, index, status: "uploading" });

    try {
      const photos = await apiRequest<OrderPhoto[]>(`/orders/${orderId}/photos`, {
        method: "POST",
        body: formData
      });
      uploaded.push(...photos);
      onProgress?.({ file, index, photos, status: "uploaded" });
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error("Не удалось загрузить фото");
      failed.push({
        error: uploadError,
        fileName: file.name
      });
      onProgress?.({ error: uploadError, file, index, status: "failed" });
    }
  }

  return { failed, uploaded };
}

export function deleteOrderPhotoRequest(orderId: number, photoId: number) {
  return apiRequest<void>(`/orders/${orderId}/photos/${photoId}`, { method: "DELETE" });
}

export function getShareInfoRequest(orderId: number) {
  return apiRequest<OrderShareInfo>(`/orders/${orderId}/photos/share`);
}

export function generateShareTokenRequest(orderId: number) {
  return apiRequest<OrderShareInfo>(`/orders/${orderId}/photos/share`, { method: "POST" });
}

export function revokeShareTokenRequest(orderId: number) {
  return apiRequest<void>(`/orders/${orderId}/photos/share`, { method: "DELETE" });
}

/** Fetches a photo file blob with auth and returns an object URL. */
export async function fetchPhotoObjectUrl(orderId: number, photoId: number, thumb = false): Promise<string> {
  const session = readAuthSession();
  const headers: HeadersInit = {};
  if (session?.accessToken) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }
  const response = await fetch(
    `${env.apiBaseUrl}/orders/${orderId}/photos/${photoId}/file?thumb=${thumb}`,
    { headers }
  );
  if (!response.ok) throw new Error("Не удалось загрузить фото");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Returns the URL for a public (share page) photo file — no auth required. */
export function publicPhotoFileUrl(token: string, photoKey: string, thumb = false): string {
  return `${env.apiBaseUrl}/p/${token}/photos/${photoKey}/file?thumb=${thumb}`;
}

/** Fetches photos for a public share token (no auth). */
export async function listPublicPhotosRequest(token: string): Promise<PublicOrderPhoto[]> {
  const response = await fetch(`${env.apiBaseUrl}/p/${token}`);
  if (!response.ok) throw new Error("Страница не найдена");
  return response.json() as Promise<PublicOrderPhoto[]>;
}
