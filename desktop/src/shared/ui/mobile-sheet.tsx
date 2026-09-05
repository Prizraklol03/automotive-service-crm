import { type MouseEvent, type PropsWithChildren, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/cn";

let overlayLayerSeed = 0;

export function MobileSheet({
  children,
  closeOnBackdropClick = true,
  className,
  onClose
}: PropsWithChildren<{ className?: string; closeOnBackdropClick?: boolean; onClose: () => void }>) {
  const [layer, setLayer] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    overlayLayerSeed += 1;
    setLayer(overlayLayerSeed);
    setMounted(true);
  }, []);

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/35 backdrop-blur-sm dark:bg-black/60"
      style={{ zIndex: 100 + layer * 10 }}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className={cn("mobile-sheet-frame flex h-full min-h-0 flex-col overflow-hidden bg-background", className)}
        onClick={stopPropagation}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
