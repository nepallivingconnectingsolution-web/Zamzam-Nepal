import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Hide the drag handle + close button — for fully custom header content. */
  hideChrome?: boolean;
}

/**
 * The app's one sheet primitive. Every action/filter/confirmation surface
 * should use this instead of a centered web dialog (see TopUpDialog /
 * BusTicketModal — both hand-rolled centered overlays predating this
 * component; migrate them here as they're touched).
 *
 * Drag-to-dismiss: dragging the handle down past a velocity/distance
 * threshold closes the sheet, same gesture as iOS/Android native sheets.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideChrome,
}: BottomSheetProps) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Element that had focus right before the sheet opened — restored on
  // close so keyboard/screen-reader users land back where they were instead
  // of at the top of the document.
  const triggerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    triggerRef.current = document.activeElement as HTMLElement | null;
    // Move focus into the sheet so Escape/Tab operate on it instead of
    // whatever was focused in the page behind it (screen readers announce
    // the dialog on the same beat).
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
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose();
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="pointer-events-none fixed inset-0 z-50 flex flex-col justify-end">
          {/* Scrim is ink at 40%, never a pure-black wash — a black scrim
              flattens the brand color out of the screen behind it.
              pointerEvents flips to "none" the instant the exit transition
              starts (not when it finishes) — a discrete style prop like this
              is applied immediately, not tweened, so even if the exit
              animation's unmount is ever delayed or interrupted, this
              full-viewport layer stops swallowing clicks right away instead
              of silently freezing the page behind it until it eventually
              clears. See BusListPage/OperatorBusManager incident, 2026-08-24. */}
          <motion.div
            initial={{ opacity: 0, pointerEvents: "none" }}
            animate={{ opacity: 1, pointerEvents: "auto" }}
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClose}
            className="absolute inset-0 backdrop-blur-[2px]"
            style={{ background: "rgba(30, 39, 35, 0.4)" }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ y: "100%", pointerEvents: "none" }}
            animate={{ y: 0, pointerEvents: "auto" }}
            exit={{ y: "100%", pointerEvents: "none" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            className={cn(
              "relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-card shadow-e2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]",
              className,
            )}
          >
            {!hideChrome && (
              <div className="sticky top-0 z-10 bg-card pt-2.5">
                {/* 4px drag handle at ink-20% */}
                <div className="mx-auto h-1 w-10 rounded-full bg-ink/20 dark:bg-white/20" />
                {(title || description) && (
                  <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
                    <div className="min-w-0">
                      {title && (
                        <h2 id={titleId} className="font-display text-h1 font-bold">
                          {title}
                        </h2>
                      )}
                      {description && <p className="mt-0.5 text-body text-muted-fg">{description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="shrink-0 rounded-full bg-surface-2 p-1.5 text-muted-fg transition-colors active:scale-95"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="px-5 pb-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
