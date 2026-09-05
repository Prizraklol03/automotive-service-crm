import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Clock3, Copy, Link, Loader2, Plus, SlidersHorizontal, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";

import {
  useDeletePhotoMutation,
  useGenerateShareMutation,
  useOrderPhotosQuery,
  usePhotoObjectUrl,
  useRevokeShareMutation,
  useShareInfoQuery,
  useUploadPhotosMutation
} from "@/features/orders/api/order-photos-hooks";
import { BeforeAfterSlider } from "@/features/orders/ui/before-after-slider";
import { PhotoLightbox } from "@/features/orders/ui/photo-lightbox";
import type { OrderPhoto, PhotoStage } from "@/features/orders/model/photo-types";
import { STAGE_LABELS, STAGE_ORDER } from "@/features/orders/model/photo-types";
import { cn } from "@/shared/lib/cn";
import { useScopedBooleanPreference } from "@/shared/hooks/use-scoped-boolean-preference";
import { AppButton } from "@/shared/ui/app-button";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";

type PhotoSourceMode = "camera" | "gallery";
type UploadQueueStatus = "failed" | "queued" | "uploaded" | "uploading";

type UploadQueueItem = {
  error?: string;
  fileName: string;
  previewUrl: string | null;
  status: UploadQueueStatus;
};

const UPLOAD_STATUS_LABELS: Record<UploadQueueStatus, string> = {
  failed: "Ошибка",
  queued: "В очереди",
  uploaded: "Загружено",
  uploading: "Загружается"
};

function UploadQueuePreview({ item }: { item: UploadQueueItem }) {
  const icon =
    item.status === "uploaded" ? (
      <Check className="h-4 w-4" />
    ) : item.status === "failed" ? (
      <X className="h-4 w-4" />
    ) : item.status === "uploading" ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Clock3 className="h-4 w-4" />
    );

  return (
    <div className="min-w-0" title={item.error ?? item.fileName}>
      <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" style={{ imageOrientation: "from-image" }} />
        ) : null}
        <div className="absolute inset-0 bg-black/35" />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center text-white",
            item.status === "failed" && "bg-danger/45",
            item.status === "uploaded" && "bg-success/35"
          )}
          aria-label={`${item.fileName}: ${UPLOAD_STATUS_LABELS[item.status]}`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{item.fileName}</p>
      <p className={cn("truncate text-xs", item.status === "failed" ? "text-danger" : "text-muted-foreground")}>
        {UPLOAD_STATUS_LABELS[item.status]}
      </p>
    </div>
  );
}

function useInViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
        }
      },
      { rootMargin: "160px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";

  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy copy path.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }

  return copied;
}

// ──────────────────────── Thumbnail ──────────────────────────────────────────

function PhotoThumb({
  orderId,
  photo,
  onOpen,
  onDelete,
  isDeleting,
  showDeleteButton = true
}: {
  orderId: number;
  photo: OrderPhoto;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  showDeleteButton?: boolean;
}) {
  const { ref, isVisible } = useInViewport<HTMLDivElement>();
  const { data: src, isPending } = usePhotoObjectUrl(orderId, photo.id, true, isVisible);
  const showPlaceholder = !isVisible || isPending;

  return (
    <div ref={ref} className="group relative aspect-square overflow-hidden rounded-xl bg-surface-2">
      {showPlaceholder ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <img
          src={src}
          alt={photo.filename}
          className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-105"
          style={{ imageOrientation: "from-image" }}
          onClick={onOpen}
        />
      )}
      {showDeleteButton ? (
        <button
          type="button"
          disabled={isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-1.5 top-1.5 hidden rounded-full bg-black/60 p-1 text-white/80 transition-colors hover:bg-danger hover:text-white group-hover:flex"
          aria-label="Удалить фото"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

// ──────────────────────── Stage picker (portal, z-500) ───────────────────────

function BottomSheet({
  onClose,
  children
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-end bg-black/60 backdrop-blur-sm"
      style={{ zIndex: 500 }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-border" />
        {children}
      </div>
    </div>,
    document.body
  );
}

function StagePicker({
  onPick,
  onClose
}: {
  onPick: (stage: PhotoStage) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <p className="px-5 pb-3 text-sm font-semibold text-foreground">Выберите этап</p>
      <div className="flex flex-col divide-y divide-border/60">
        {STAGE_ORDER.map((stage) => (
          <button
            key={stage}
            type="button"
            className="flex items-center gap-4 px-5 py-4 text-left transition-colors active:bg-accent-muted"
            onClick={() => onPick(stage)}
          >
            <Camera className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="text-base font-medium text-foreground">{STAGE_LABELS[stage]}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="w-full px-5 py-4 text-center text-sm font-medium text-muted-foreground transition-colors active:bg-accent-muted"
        onClick={onClose}
      >
        Отмена
      </button>
    </BottomSheet>
  );
}

function SourcePicker({
  onClose,
  onPick
}: {
  onClose: () => void;
  onPick: (mode: PhotoSourceMode) => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <p className="px-5 pb-3 text-sm font-semibold text-foreground">Добавить фото</p>
      <div className="flex flex-col divide-y divide-border/60">
        <button
          type="button"
          className="flex items-center gap-4 px-5 py-4 text-left transition-colors active:bg-accent-muted"
          onClick={() => onPick("camera")}
        >
          <Camera className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="text-base font-medium text-foreground">Сделать фото</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-4 px-5 py-4 text-left transition-colors active:bg-accent-muted"
          onClick={() => onPick("gallery")}
        >
          <Plus className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="text-base font-medium text-foreground">Загрузить из галереи</span>
        </button>
      </div>
      <button
        type="button"
        className="w-full px-5 py-4 text-center text-sm font-medium text-muted-foreground transition-colors active:bg-accent-muted"
        onClick={onClose}
      >
        Отмена
      </button>
    </BottomSheet>
  );
}

// ──────────────────────── Desktop stage picker (portal, z-500) ───────────────

function DesktopStagePicker({
  onPick,
  onClose
}: {
  onPick: (stage: PhotoStage) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/45 backdrop-blur-sm"
      style={{ zIndex: 500 }}
      onClick={onClose}
    >
      <div
        className="absolute bottom-6 right-6 w-[min(360px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-border/80 bg-surface pt-1 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-border" />
        <p className="px-5 pb-3 text-sm font-semibold text-foreground">Выберите этап</p>
        <div className="flex flex-col divide-y divide-border/60">
          {STAGE_ORDER.map((stage) => (
            <button
              key={stage}
              type="button"
              className="flex items-center gap-4 px-5 py-4 text-left transition-colors active:bg-accent-muted"
              onClick={() => onPick(stage)}
            >
              <Camera className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="text-base font-medium text-foreground">{STAGE_LABELS[stage]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="w-full px-5 py-4 text-center text-sm font-medium text-muted-foreground transition-colors active:bg-accent-muted"
          onClick={onClose}
        >
          Отмена
        </button>
      </div>
    </div>,
    document.body
  );
}

// ──────────────────────── Share panel ────────────────────────────────────────

function SharePanel({ orderId, sectionClassName }: { orderId: number; sectionClassName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const shareQuery = useShareInfoQuery(orderId, isOpen);
  const generateMutation = useGenerateShareMutation(orderId);
  const revokeMutation = useRevokeShareMutation(orderId);
  const [copied, setCopied] = useState(false);

  const token = shareQuery.data?.share_token;
  const sharePageUrl = token ? `${window.location.origin}/p/${token}` : null;

  async function handleCopy() {
    if (!sharePageUrl) return;
    const copiedText = await copyTextToClipboard(sharePageUrl);
    if (!copiedText) return;

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn(sectionClassName, "mt-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Link className="h-4 w-4 text-muted-foreground" />
          Публичная ссылка
        </div>
        <AppButton type="button" variant="outline" size="sm" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Скрыть" : "Показать"}
        </AppButton>
      </div>
      {!isOpen ? (
        <p className="mt-2 text-xs text-muted-foreground">Ссылка загрузится после открытия блока.</p>
      ) : shareQuery.isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">Загружаем ссылку...</p>
      ) : shareQuery.isError ? (
        <p className="mt-2 text-xs text-danger">Не удалось загрузить публичную ссылку.</p>
      ) : token ? (
        <div className="mt-3 flex items-center gap-2">
          <AppButton type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Скопировано" : "Копировать"}
          </AppButton>
          <AppButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => revokeMutation.mutate()}
            disabled={revokeMutation.isPending}
          >
            <X className="h-3.5 w-3.5" />
          </AppButton>
        </div>
      ) : (
        <div className="mt-3">
          <AppButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Создать ссылку
          </AppButton>
        </div>
      )}
      {isOpen && sharePageUrl && (
        <p className="mt-2 truncate text-xs text-muted-foreground">{sharePageUrl}</p>
      )}
    </div>
  );
}

// ──────────────────────── Main section ───────────────────────────────────────

export function OrderPhotoSection({
  orderId,
  sectionClassName,
  isModernDesktop,
  useDesktopStagePicker
}: {
  orderId: number;
  sectionClassName: string;
  isModernDesktop: boolean;
  useDesktopStagePicker: boolean;
}) {
  const { value: isExpanded, setValue: setIsExpanded } = useScopedBooleanPreference("crm.pref.orderPhotosExpanded", false);
  const photosQuery = useOrderPhotosQuery(orderId, isExpanded);
  const uploadMutation = useUploadPhotosMutation(orderId);
  const deleteMutation = useDeletePhotoMutation(orderId);

  const [showStagePicker, setShowStagePicker] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [pendingStage, setPendingStage] = useState<PhotoStage | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<OrderPhoto[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const systemInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const isIos = isIosDevice();

  const photos = photosQuery.data ?? [];
  const byStage = STAGE_ORDER.reduce<Record<PhotoStage, OrderPhoto[]>>(
    (acc, stage) => {
      acc[stage] = photos.filter((p) => p.stage === stage);
      return acc;
    },
    { inspection: [], before: [], process: [], after: [] }
  );

  const hasBeforeAndAfter = byStage.before.length > 0 && byStage.after.length > 0;
  const beforeAfterPair = hasBeforeAndAfter ? { before: byStage.before[0]!, after: byStage.after[0]! } : null;

  useEffect(
    () => () => {
      uploadQueueRef.current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    },
    []
  );

  function replaceUploadQueue(nextQueue: UploadQueueItem[]) {
    uploadQueueRef.current.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    uploadQueueRef.current = nextQueue;
    setUploadQueue(nextQueue);
  }

  function updateUploadQueue(index: number, update: Partial<UploadQueueItem>) {
    setUploadQueue((currentQueue) => {
      const nextQueue = currentQueue.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item));
      uploadQueueRef.current = nextQueue;
      return nextQueue;
    });
  }

  function openInput(mode: PhotoSourceMode | "system") {
    const input =
      mode === "system"
        ? systemInputRef.current
        : mode === "camera"
          ? cameraInputRef.current
          : galleryInputRef.current;

    if (!input) {
      return;
    }

    input.value = "";
    input.click();
  }

  function handleStageSelected(stage: PhotoStage) {
    setShowStagePicker(false);
    setPendingStage(stage);
    if (useDesktopStagePicker) {
      openInput("gallery");
      return;
    }
    if (isIos) {
      openInput("system");
      return;
    }
    setShowSourcePicker(true);
  }

  function handleSourceSelected(mode: PhotoSourceMode) {
    setShowSourcePicker(false);
    openInput(mode);
  }

  async function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const stage = pendingStage;
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";

    if (!stage || files.length === 0) {
      setPendingStage(null);
      return;
    }

    setUploadError(null);
    replaceUploadQueue(
      files.map((file, index) => ({
        fileName: file.name,
        previewUrl: typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
        status: index === 0 ? "uploading" : "queued"
      }))
    );
    try {
      const result = await uploadMutation.mutateAsync({
        stage,
        files,
        onProgress: (progress) => {
          if (progress.status === "uploading") {
            updateUploadQueue(progress.index, { status: "uploading" });
            return;
          }
          if (progress.status === "uploaded") {
            updateUploadQueue(progress.index, { status: "uploaded" });
            return;
          }
          updateUploadQueue(progress.index, { error: progress.error.message, status: "failed" });
        }
      });
      if (result.failed.length) {
        setUploadError(
          result.uploaded.length
            ? `Загружено: ${result.uploaded.length}. Не удалось загрузить: ${result.failed.length}.`
            : `Не удалось загрузить ${result.failed.length} фото. Попробуйте снова.`
        );
      }
    } catch {
      setUploadError("Не удалось загрузить фото. Попробуйте снова.");
    } finally {
      setPendingStage(null);
    }
  }

  async function handleDelete(photoId: number) {
    setDeletingId(photoId);
    try {
      await deleteMutation.mutateAsync(photoId);
      setLightboxPhotos((currentPhotos) => {
        if (!currentPhotos) {
          return currentPhotos;
        }

        const nextPhotos = currentPhotos.filter((photo) => photo.id !== photoId);
        if (nextPhotos.length === 0) {
          setLightboxIndex(0);
          return null;
        }

        setLightboxIndex((currentIndex) => Math.min(currentIndex, nextPhotos.length - 1));
        return nextPhotos;
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleLightboxDelete(photo: OrderPhoto) {
    if (!window.confirm("Удалить фотографию?")) {
      return;
    }

    await handleDelete(photo.id);
  }

  function openLightbox(stagePhotos: OrderPhoto[], index: number) {
    setLightboxPhotos(stagePhotos);
    setLightboxIndex(index);
  }

  const emptyClass = cn(
    "py-5 text-center text-xs text-muted-foreground",
    isModernDesktop ? "rounded-xl bg-surface-2/50" : "rounded-2xl border border-dashed border-border"
  );

  if (!isExpanded) {
    return (
      <section className={sectionClassName}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Фотографии</h3>
          <AppButton type="button" variant="outline" size="sm" onClick={() => setIsExpanded(true)}>
            <ChevronDown className="h-3.5 w-3.5" />
            Показать
          </AppButton>
        </div>
        <div className={cn(emptyClass, "mt-4")}>Фотографии и публичная ссылка загрузятся после раскрытия блока.</div>
      </section>
    );
  }

  return (
    <section className={sectionClassName}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Фотографии</h3>
        <div className="flex items-center gap-2">
          {hasBeforeAndAfter && (
            <AppButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowBeforeAfter(true)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              До / После
            </AppButton>
          )}
          <AppButton
            type="button"
            size="sm"
            onClick={() => setShowStagePicker(true)}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            Добавить
          </AppButton>
          <AppButton type="button" variant="outline" size="sm" onClick={() => setIsExpanded(false)}>
            <ChevronUp className="h-3.5 w-3.5" />
            Свернуть
          </AppButton>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={systemInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFilesChosen} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={handleFilesChosen} />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFilesChosen} />

      {uploadError ? <p role="alert" className="mt-3 text-sm text-danger">{uploadError}</p> : null}

      {uploadQueue.length ? (
        <div className="mt-4" role="status" aria-live="polite" data-testid="order-photo-upload-progress">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Загрузка фото</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {uploadQueue.map((item, index) => (
              <UploadQueuePreview key={`${item.fileName}-${index}`} item={item} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Stages */}
      {photos.length === 0 && !photosQuery.isPending ? (
        <div className={cn(emptyClass, "mt-4")}>
          Нажмите «Добавить», чтобы прикрепить фото к заказу
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {STAGE_ORDER.map((stage) => {
            const stagePhotos = byStage[stage];
            if (stagePhotos.length === 0) return null;
            return (
              <div key={stage}>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {stagePhotos.map((photo, idx) => (
                    <PhotoThumb
                      key={photo.id}
                      orderId={orderId}
                      photo={photo}
                      onOpen={() => openLightbox(stagePhotos, idx)}
                      onDelete={() => handleDelete(photo.id)}
                      isDeleting={deletingId === photo.id}
                      showDeleteButton={useDesktopStagePicker}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share */}
      <SharePanel orderId={orderId} sectionClassName="rounded-xl border border-border/60 bg-surface-2/40 p-3" />

      {/* Stage picker */}
      {showStagePicker && (
        useDesktopStagePicker ? (
          <DesktopStagePicker onPick={handleStageSelected} onClose={() => setShowStagePicker(false)} />
        ) : (
          <StagePicker onPick={handleStageSelected} onClose={() => setShowStagePicker(false)} />
        )
      )}

      {/* Source picker (mobile, non-iOS) */}
      {showSourcePicker && !isIos && !useDesktopStagePicker && (
        <SourcePicker
          onPick={handleSourceSelected}
          onClose={() => {
            setShowSourcePicker(false);
            setPendingStage(null);
          }}
        />
      )}

      {/* Lightbox */}
      {lightboxPhotos && (
        <PhotoLightbox
          orderId={orderId}
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          onNavigate={setLightboxIndex}
          onDelete={handleLightboxDelete}
          isDeleting={deletingId === lightboxPhotos[lightboxIndex]?.id}
          showDeleteAction={!useDesktopStagePicker}
          onClose={() => setLightboxPhotos(null)}
        />
      )}

      {/* Before/After slider */}
      {showBeforeAfter && hasBeforeAndAfter &&
        createPortal(
          <div
            className="fixed inset-0 flex flex-col items-center justify-center bg-black/95 p-4"
            style={{ zIndex: 500 }}
            onClick={() => setShowBeforeAfter(false)}
          >
            <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Сравнение До / После</p>
                <button
                  type="button"
                  className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setShowBeforeAfter(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <BeforeAfterSlider
                orderId={orderId}
                beforePhoto={beforeAfterPair!.before}
                afterPhoto={beforeAfterPair!.after}
              />
            </div>
          </div>,
          document.body
        )
      }
    </section>
  );
}
