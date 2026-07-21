import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastVariant } from "@/stores/toast.store";

const ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ACCENT: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent",
};

/** Fixed, stacked toasts in the bottom-right; auto-dismiss handled by the store. */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lift backdrop-blur-xl"
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", ACCENT[t.variant])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-fg">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 text-muted-fg transition-colors hover:text-fg"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
