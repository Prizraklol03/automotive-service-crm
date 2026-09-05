import { useEffect, useRef } from "react";

let overlayCounter = 0;
const overlayStack: number[] = [];

function isTopOverlay(id: number) {
  return overlayStack[overlayStack.length - 1] === id;
}

function removeOverlay(id: number) {
  const index = overlayStack.lastIndexOf(id);
  if (index >= 0) {
    overlayStack.splice(index, 1);
  }
}

export function useOverlayMode(active: boolean, onClose?: () => void) {
  const overlayIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    overlayCounter += 1;
    const overlayId = overlayCounter;
    overlayIdRef.current = overlayId;
    overlayStack.push(overlayId);

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.documentElement.style.overflow = "hidden";

    return () => {
      removeOverlay(overlayId);
      overlayIdRef.current = null;

      if (!overlayStack.length) {
        document.body.style.overflow = previousBodyOverflow;
        document.body.style.paddingRight = previousBodyPaddingRight;
        document.documentElement.style.overflow = previousDocumentOverflow;
      }
    };
  }, [active]);

  useEffect(() => {
    if (!active || !onClose) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const overlayId = overlayIdRef.current;
      if (event.key === "Escape" && overlayId !== null && isTopOverlay(overlayId)) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [active, onClose]);
}
