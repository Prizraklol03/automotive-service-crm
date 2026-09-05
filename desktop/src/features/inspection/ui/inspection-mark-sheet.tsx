import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, Trash2, X } from "lucide-react";

import {
  useDeleteInspectionMarkPhotoMutation,
  useInspectionMarkPhotoObjectUrl,
  useUploadInspectionMarkPhotosMutation,
} from "@/features/inspection/api/inspection-hooks";
import type {
  InspectionDefectType,
  InspectionGeometryType,
  InspectionMark,
  InspectionMarkPayload,
  InspectionMarkStatus,
  InspectionSeverity,
} from "@/features/inspection/model/types";
import {
  INSPECTION_DEFECT_LABELS,
  INSPECTION_MARK_STATUS_LABELS,
  INSPECTION_SEVERITY_LABELS,
} from "@/features/inspection/model/types";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelect } from "@/shared/ui/app-select";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { MobileSheet } from "@/shared/ui/mobile-sheet";

function MarkPhotoThumb({
  canDelete,
  sessionId,
  markId,
  photoId,
  onDelete,
  isDeleting,
}: {
  canDelete: boolean;
  sessionId: number;
  markId: number;
  photoId: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { data, isPending } = useInspectionMarkPhotoObjectUrl(sessionId, markId, photoId);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface-2">
      {data ? (
        <img alt="" className="h-24 w-full object-cover" src={data} />
      ) : (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          {isPending ? "Загрузка..." : "Нет превью"}
        </div>
      )}
      <button
        aria-label="Удалить фото"
        className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white transition hover:bg-black"
        disabled={!canDelete || isDeleting}
        onClick={onDelete}
        type="button"
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SheetCard({
  children,
  className,
  isMobile,
}: React.PropsWithChildren<{ className?: string; isMobile: boolean }>) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden bg-background shadow-panel",
        isMobile
          ? "h-svh w-full"
          : "max-h-[min(860px,calc(100svh-2rem))] w-[min(420px,calc(100vw-2rem))] rounded-[28px] border border-border/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

type EditableMarkDraft = InspectionMarkPayload & {
  id?: number;
  photos?: InspectionMark["photos"];
};

const DEFECT_OPTIONS = Object.entries(INSPECTION_DEFECT_LABELS) as Array<[InspectionDefectType, string]>;
const SEVERITY_OPTIONS = Object.entries(INSPECTION_SEVERITY_LABELS) as Array<[InspectionSeverity, string]>;
const STATUS_OPTIONS = Object.entries(INSPECTION_MARK_STATUS_LABELS) as Array<[InspectionMarkStatus, string]>;

export function InspectionMarkSheet({
  canEdit,
  draft,
  isMobile,
  isOpen,
  onClose,
  onDeleteMark,
  onSave,
  orderId,
  sessionId,
}: {
  canEdit: boolean;
  draft: EditableMarkDraft | null;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  onDeleteMark: (markId: number) => Promise<void>;
  onSave: (payload: EditableMarkDraft) => Promise<InspectionMark | null>;
  orderId: number;
  sessionId: number;
}) {
  const [localDraft, setLocalDraft] = useState<EditableMarkDraft | null>(draft);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingMark, setIsDeletingMark] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const uploadPhotosMutation = useUploadInspectionMarkPhotosMutation(orderId, sessionId);
  const deletePhotoMutation = useDeleteInspectionMarkPhotoMutation(orderId, sessionId);

  useEffect(() => {
    setLocalDraft(draft);
    setErrorMessage(null);
  }, [draft]);

  const existingMarkId = localDraft?.id ?? null;
  const markPhotos = useMemo(() => localDraft?.photos ?? [], [localDraft?.photos]);

  if (!isOpen || !localDraft) {
    return null;
  }

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage(null);
      const saved = await onSave(localDraft);
      if (saved) {
        setLocalDraft({
          ...localDraft,
          id: saved.id,
          photos: saved.photos,
        });
      } else {
        onClose();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить отметку");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingMarkId) {
      onClose();
      return;
    }
    if (!window.confirm("Удалить отметку осмотра?")) {
      return;
    }
    try {
      setIsDeletingMark(true);
      await onDeleteMark(existingMarkId);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось удалить отметку");
    } finally {
      setIsDeletingMark(false);
    }
  };

  const handleUploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !existingMarkId) {
      return;
    }
    await uploadPhotosMutation.mutateAsync({ markId: existingMarkId, files: Array.from(files) });
    const saved = await onSave(localDraft);
    if (saved) {
      setLocalDraft({ ...localDraft, id: saved.id, photos: saved.photos });
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    await deletePhotoMutation.mutateAsync(photoId);
    const saved = await onSave(localDraft);
    if (saved) {
      setLocalDraft({ ...localDraft, id: saved.id, photos: saved.photos });
    }
  };

  const content = (
    <SheetCard isMobile={isMobile}>
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {localDraft.id ? "Редактирование отметки" : "Новая отметка"}
          </div>
          <div className="mt-1 text-base font-semibold">
            {localDraft.geometry_type === "point"
              ? "Точка дефекта"
              : localDraft.geometry_type === "line"
                ? "Линия дефекта"
                : "Область дефекта"}
          </div>
        </div>
        <AppButton aria-label="Закрыть" onClick={onClose} size="icon" variant="ghost">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Тип дефекта</span>
            <AppSelect
              disabled={!canEdit}
              value={localDraft.defect_type}
              onChange={(event) =>
                setLocalDraft((current) =>
                  current ? { ...current, defect_type: event.target.value as InspectionDefectType } : current,
                )
              }
            >
              {DEFECT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </AppSelect>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Степень</span>
              <AppSelect
                disabled={!canEdit}
                value={localDraft.severity}
                onChange={(event) =>
                  setLocalDraft((current) =>
                    current ? { ...current, severity: event.target.value as InspectionSeverity } : current,
                  )
                }
              >
                {SEVERITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AppSelect>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Статус</span>
              <AppSelect
                disabled={!canEdit}
                value={localDraft.status}
                onChange={(event) =>
                  setLocalDraft((current) =>
                    current ? { ...current, status: event.target.value as InspectionMarkStatus } : current,
                  )
                }
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AppSelect>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Комментарий</span>
            <AppTextarea
              className="min-h-24"
              disabled={!canEdit}
              placeholder="Коротко опишите дефект или контекст."
              value={localDraft.comment ?? ""}
              onChange={(event) =>
                setLocalDraft((current) => (current ? { ...current, comment: event.target.value } : current))
              }
            />
          </label>

          <section className="rounded-2xl border border-border/80 bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Фото отметки</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {existingMarkId
                    ? "Фотографии будут привязаны именно к этой отметке."
                    : "Сначала сохраните отметку, затем можно будет добавить фото."}
                </div>
              </div>
              <label className="inline-flex">
                <input
                  accept="image/*"
                  className="hidden"
                  disabled={!canEdit || !existingMarkId || uploadPhotosMutation.isPending}
                  multiple
                  onChange={(event) => void handleUploadPhotos(event.target.files)}
                  type="file"
                />
                <AppButton disabled={!canEdit || !existingMarkId || uploadPhotosMutation.isPending} size="sm" variant="outline" asChild>
                  <span>
                    {uploadPhotosMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Добавить фото
                  </span>
                </AppButton>
              </label>
            </div>

            {markPhotos.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {markPhotos.map((photo) => (
                  <MarkPhotoThumb
                    canDelete={canEdit}
                    key={photo.id}
                    sessionId={sessionId}
                    markId={existingMarkId ?? photo.inspection_mark_id}
                    photoId={photo.id}
                    isDeleting={deletePhotoMutation.isPending}
                    onDelete={() => void handleDeletePhoto(photo.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Пока без фотографий.
              </div>
            )}
          </section>

          {errorMessage ? <div className="text-sm text-danger">{errorMessage}</div> : null}
        </div>
      </div>

      <div className="border-t border-border px-4 py-4">
        <div className="flex gap-3">
          {canEdit ? (
            <>
              <AppButton className="flex-1" disabled={isSaving} onClick={() => void handleSave()}>
                {isSaving ? "Сохраняем..." : localDraft.id ? "Сохранить" : "Создать отметку"}
              </AppButton>
              <AppButton disabled={isDeletingMark} onClick={() => void handleDelete()} variant="outline">
                {isDeletingMark ? "Удаляем..." : "Удалить"}
              </AppButton>
            </>
          ) : (
            <AppButton className="flex-1" onClick={onClose} variant="outline">
              Закрыть
            </AppButton>
          )}
        </div>
      </div>
    </SheetCard>
  );

  if (isMobile) {
    return (
      <MobileSheet className="h-full" onClose={onClose}>
        {content}
      </MobileSheet>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[420] bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute bottom-6 right-6"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    </div>,
    document.body,
  );
}
