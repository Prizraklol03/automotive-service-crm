import { useRef, useState } from "react";

import { usePhotoObjectUrl } from "@/features/orders/api/order-photos-hooks";
import type { OrderPhoto } from "@/features/orders/model/photo-types";

function SliderImage({ orderId, photo, clip }: { orderId: number; photo: OrderPhoto; clip?: string }) {
  const { data: src } = usePhotoObjectUrl(orderId, photo.id, false);
  return (
    <img
      src={src}
      alt={photo.filename}
      className="absolute inset-0 h-full w-full select-none object-cover"
      style={{ clipPath: clip, imageOrientation: "from-image", userSelect: "none" }}
      draggable={false}
    />
  );
}

export function BeforeAfterSlider({
  orderId,
  beforePhoto,
  afterPhoto
}: {
  orderId: number;
  beforePhoto: OrderPhoto;
  afterPhoto: OrderPhoto;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  function updatePosition(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full cursor-col-resize select-none overflow-hidden rounded-xl bg-black"
      onPointerDown={(e) => {
        isDragging.current = true;
        containerRef.current?.setPointerCapture(e.pointerId);
        updatePosition(e.clientX);
      }}
      onPointerMove={(e) => {
        if (isDragging.current) updatePosition(e.clientX);
      }}
      onPointerUp={() => { isDragging.current = false; }}
      onPointerCancel={() => { isDragging.current = false; }}
    >
      {/* After (full) */}
      <SliderImage orderId={orderId} photo={afterPhoto} />

      {/* Before (clipped to left side) */}
      <SliderImage
        orderId={orderId}
        photo={beforePhoto}
        clip={`inset(0 ${100 - position}% 0 0)`}
      />

      {/* Divider */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-black" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l-6-6 6-6M15 6l6 6-6 6" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white/90">До</div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white/90">После</div>
    </div>
  );
}
