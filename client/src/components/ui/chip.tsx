import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/**
 * Tap-to-select pill — cancellation reasons, filter pills, quick replies.
 * No hover-only state: selection is driven by `selected`, and press feedback
 * is `active:scale-[0.97]` rather than a hover color (this app has no mice).
 */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-fast active:scale-[0.97]",
        selected
          ? "border-brand-900 bg-brand-900 text-white dark:border-white dark:bg-white dark:text-brand-900"
          : "border-border bg-surface text-fg",
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = "Chip";
