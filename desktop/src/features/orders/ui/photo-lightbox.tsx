import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, Trash2, X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { usePhotoObjectUrl } from "@/features/orders/api/order-photos-hooks";
import type { OrderPhoto } from "@/features/orders/model/photo-types";

function PhotoImage({ orderId, photo }: { orderId: number; photo: OrderPhoto }) {
  const { data: src, isPending } = usePhotoObjectUrl(orderId, photo.id, false);
  return (
    <img
      src={src}
      alt={photo.filename}
      className={cn(
        "max-h-full max-w-full rounded-lg object-contain transition-opacity duration-200",
        isPending && "opacity-0"
      )}
      style={{ imageOrientation: "from-image" }}
    />
  );
}

export function PhotoLightbox({
  orderId,
  photos,
  currentIndex,
  onClose,
  onNavigate,
  onDelete,
  isDeleting = false,
  showDeleteAction = false
}: {
  orderId: number;
  photos: OrderPhoto[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete?: (photo: OrderPhoto) => void;
  isDeleting?: boolean;
  showDeleteAction?: boolean;
}) {
  const current = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [currentIndex, hasPrev, hasNext, onClose, onNavigate]);

  if (!current) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[260] flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-white/60">
          {currentIndex + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2">
          {showDeleteAction && onDelete ? (
            <button
              type="button"
              disabled={isDeleting}
              className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
              onClick={() => onDelete(current)}
              aria-label="Удалить фото"
            >
              {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {hasPrev && (
          <button
            type="button"
            className="absolute left-2 z-10 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(currentIndex - 1);
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <div className="flex h-full w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <PhotoImage orderId={orderId} photo={current} />
        </div>

        {hasNext && (
          <button
            type="button"
            className="absolute right-2 z-10 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(currentIndex + 1);
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
