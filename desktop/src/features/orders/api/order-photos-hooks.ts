import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  deleteOrderPhotoRequest,
  fetchPhotoObjectUrl,
  generateShareTokenRequest,
  getShareInfoRequest,
  listOrderPhotosRequest,
  revokeShareTokenRequest,
  uploadOrderPhotosRequest,
  type OrderPhotoUploadProgress
} from "@/features/orders/api/order-photos-api";
import type { OrderPhoto, PhotoStage } from "@/features/orders/model/photo-types";

export function orderPhotosKey(orderId: number) {
  return ["orders", orderId, "photos"] as const;
}

export function mergeOrderPhotos(current: OrderPhoto[] | undefined, uploaded: OrderPhoto[]) {
  const next = [...(current ?? [])];
  const knownIds = new Set(next.map((photo) => photo.id));

  for (const photo of uploaded) {
    if (!knownIds.has(photo.id)) {
      next.push(photo);
      knownIds.add(photo.id);
    }
  }

  return next;
}

export function useOrderPhotosQuery(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: orderPhotosKey(orderId!),
    queryFn: () => listOrderPhotosRequest(orderId!),
    enabled: orderId != null && enabled,
    staleTime: 30_000
  });
}

export function useUploadPhotosMutation(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      stage,
      files,
      onProgress
    }: {
      stage: PhotoStage;
      files: File[];
      onProgress?: (progress: OrderPhotoUploadProgress) => void;
    }) =>
      uploadOrderPhotosRequest(orderId, stage, files, (progress) => {
        if (progress.status === "uploaded") {
          queryClient.setQueryData<OrderPhoto[]>(orderPhotosKey(orderId), (current) =>
            mergeOrderPhotos(current, progress.photos)
          );
        }
        onProgress?.(progress);
      }),
    onSuccess: (result) => {
      if (result.uploaded.length) {
        queryClient.setQueryData<OrderPhoto[]>(orderPhotosKey(orderId), (current) => mergeOrderPhotos(current, result.uploaded));
      }
      void queryClient.invalidateQueries({ queryKey: orderPhotosKey(orderId) });
    }
  });
}

export function useDeletePhotoMutation(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => deleteOrderPhotoRequest(orderId, photoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderPhotosKey(orderId) });
    }
  });
}

export function useShareInfoQuery(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["orders", orderId, "photos", "share"],
    queryFn: () => getShareInfoRequest(orderId!),
    enabled: orderId != null && enabled,
    staleTime: 60_000
  });
}

export function useGenerateShareMutation(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generateShareTokenRequest(orderId),
    onSuccess: (result) => {
      queryClient.setQueryData(["orders", orderId, "photos", "share"], result);
    }
  });
}

export function useRevokeShareMutation(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => revokeShareTokenRequest(orderId),
    onSuccess: () => {
      queryClient.setQueryData(["orders", orderId, "photos", "share"], {
        share_token: null,
        share_url: null
      });
    }
  });
}

/** Fetches a photo as blob URL (handles auth). Revokes blob URL on unmount. */
export function usePhotoObjectUrl(orderId: number, photoId: number, thumb = false, enabled = true) {
  const [data, setData] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(Boolean(enabled));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsPending(false);
      setError(null);
      setData(undefined);
      return;
    }

    let isCancelled = false;
    let objectUrl: string | null = null;

    setIsPending(true);
    setError(null);
    setData(undefined);

    void fetchPhotoObjectUrl(orderId, photoId, thumb)
      .then((url) => {
        if (isCancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setData(url);
      })
      .catch((err: unknown) => {
        if (isCancelled) return;
        setError(err instanceof Error ? err : new Error("Не удалось загрузить фото"));
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
  }, [enabled, orderId, photoId, thumb]);

  return { data, error, isPending };
}
