import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { motion, useMotionTemplate, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export interface CollapsingHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  /** Scrollable element to track. Defaults to the nearest scrolling ancestor via window scroll. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * iOS-style large title that shrinks into a compact sticky bar as the
 * screen scrolls, instead of a static page header. Mount at the top of a
 * scrollable screen; the large title lives in normal flow below this bar,
 * so this component only renders the bar itself plus the collapse math.
 */
export function CollapsingHeader({ title, onBack, actions, scrollContainerRef, className }: CollapsingHeaderProps) {
  // useScroll's `container` option only accepts a populated RefObject — when
  // no explicit scroll container is given, omit the key entirely so it
  // falls back to tracking window scroll instead of passing `{ current: null }`.
  const { scrollY } = useScroll(
    scrollContainerRef ? { container: scrollContainerRef as React.RefObject<HTMLElement> } : undefined,
  );
  const compactOpacity = useTransform(scrollY, [24, 64], [0, 1]);
  const borderOpacity = useTransform(scrollY, [0, 64], [0, 1]);
  const borderColor = useMotionTemplate`hsl(var(--border) / ${borderOpacity})`;

  return (
    <motion.header
      style={{ borderBottomColor: borderColor }}
      className={cn(
        "sticky top-0 z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-center gap-2 border-b bg-bg/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg transition-transform active:scale-90"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      <motion.h1
        style={{ opacity: compactOpacity }}
        className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight"
      >
        {title}
      </motion.h1>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
    </motion.header>
  );
}

/** The large title itself — render just below CollapsingHeader, in normal document flow. */
export function LargeTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={cn("px-4 pb-2 pt-1 font-display text-[28px] font-bold tracking-tight text-fg", className)}>
      {children}
    </h1>
  );
}
