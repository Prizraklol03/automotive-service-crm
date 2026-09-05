import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { listPublicPhotosRequest, publicPhotoFileUrl } from "@/features/orders/api/order-photos-api";
import type { PhotoStage, PublicOrderPhoto } from "@/features/orders/model/photo-types";
import { STAGE_LABELS, STAGE_ORDER } from "@/features/orders/model/photo-types";
import { cn } from "@/shared/lib/cn";

function PublicPhotoThumb({
  photo,
  token,
  onOpen
}: {
  photo: PublicOrderPhoto;
  token: string;
  onOpen: () => void;
}) {
  const thumbUrl = publicPhotoFileUrl(token, photo.photo_key, true);
  return (
    <div className="aspect-square overflow-hidden rounded-xl bg-surface-2" onClick={onOpen}>
      <img
        src={thumbUrl}
        alt="Фотография"
        className="h-full w-full cursor-pointer object-cover transition-transform duration-200 hover:scale-105"
        style={{ imageOrientation: "from-image" }}
      />
    </div>
  );
}

function PublicLightbox({
  photo,
  token,
  onClose
}: {
  photo: PublicOrderPhoto;
  token: string;
  onClose: () => void;
}) {
  const src = publicPhotoFileUrl(token, photo.photo_key, false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Фотография"
        className="max-h-full max-w-full rounded-lg object-contain"
        style={{ imageOrientation: "from-image" }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function PhotoSharePage() {
  const { token } = useParams<{ token: string }>();
  const [lightboxPhoto, setLightboxPhoto] = useState<PublicOrderPhoto | null>(null);

  const { data: photos, isPending, isError } = useQuery({
    queryKey: ["public-photos", token],
    queryFn: () => listPublicPhotosRequest(token!),
    enabled: Boolean(token),
    retry: false
  });

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Загружаем фотографии…</p>
      </div>
    );
  }

  if (isError || !photos) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 bg-background p-8 text-center">
        <p className="text-base font-semibold text-foreground">Страница не найдена</p>
        <p className="text-sm text-muted-foreground">Ссылка недействительна или была отозвана.</p>
      </div>
    );
  }

  const byStage = STAGE_ORDER.reduce<Record<PhotoStage, PublicOrderPhoto[]>>(
    (acc, stage) => {
      acc[stage] = photos.filter((p) => p.stage === stage);
      return acc;
    },
    { inspection: [], before: [], process: [], after: [] }
  );

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Фотоотчёт</h1>
          <p className="mt-1 text-sm text-muted-foreground">{photos.length} фото</p>
        </div>

        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Фотографии ещё не добавлены.</p>
        ) : (
          <div className="space-y-6">
            {STAGE_ORDER.map((stage) => {
              const stagePhotos = byStage[stage];
              if (stagePhotos.length === 0) return null;
              return (
                <div key={stage}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {STAGE_LABELS[stage]}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {stagePhotos.map((photo) => (
                      <PublicPhotoThumb
                        key={photo.photo_key}
                        photo={photo}
                        token={token!}
                        onOpen={() => setLightboxPhoto(photo)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightboxPhoto && (
        <PublicLightbox
          photo={lightboxPhoto}
          token={token!}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </div>
  );
}
