import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhotoLightboxProps {
  photos: string[];
  index: number;
  open: boolean;
  alt: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/**
 * Fullscreen photo viewer — the one place "tap a photo, see it fullscreen"
 * is implemented. PhotoGallery is the only current caller; every detail page
 * that renders PhotoGallery gets working fullscreen photos for free.
 */
export function PhotoLightbox({ photos, index, open, alt, onClose, onIndexChange }: PhotoLightboxProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const count = photos.length;

  const goTo = React.useCallback(
    (next: number) => {
      if (count === 0) return;
      onIndexChange(((next % count) + count) % count);
    },
    [count, onIndexChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    triggerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, index, goTo, onClose]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -80 || info.velocity.x < -500) goTo(index + 1);
    else if (info.offset.x > 80 || info.velocity.x > 500) goTo(index - 1);
  }

  if (count === 0) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex flex-col bg-black/95"
          onClick={onClose}
        >
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 text-white">
            <span className="text-sm font-medium tabular-nums">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full bg-white/10 active:scale-95"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2">
            {count > 1 && (
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(index - 1);
                }}
                className="absolute left-2 z-10 hidden size-10 place-items-center rounded-full bg-white/10 text-white active:scale-95 sm:grid"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <motion.img
              key={photos[index]}
              src={photos[index]}
              alt={`${alt} photo ${index + 1} of ${count}`}
              drag={count > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={handleDragEnd}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="max-h-full max-w-full touch-pan-y select-none object-contain"
            />
            {count > 1 && (
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(index + 1);
                }}
                className="absolute right-2 z-10 hidden size-10 place-items-center rounded-full bg-white/10 text-white active:scale-95 sm:grid"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>

          {count > 1 && (
            <div className="flex items-center justify-center gap-1.5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={cn("size-1.5 rounded-full transition-colors", i === index ? "bg-white" : "bg-white/30")}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
