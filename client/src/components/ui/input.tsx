import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Turns the border error-red and shakes the field once, 180ms. */
  error?: boolean;
}

/**
 * Text input.
 *
 * Focus darkens the border to full-opacity teal — deliberately no glow or
 * drop shadow. A glowing focus ring is the most recognizable Bootstrap tell
 * there is, and it's the first thing that makes a form look generic.
 *
 * An error doesn't just print red text underneath: the border changes AND
 * the field shakes once, so the failure is felt, not just readable.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={error || undefined}
      className={cn(
        "flex h-11 w-full rounded-md border bg-surface px-3.5 text-body text-fg",
        "placeholder:text-muted-fg",
        "transition-colors duration-fast ease-standard",
        "focus-visible:outline-none disabled:opacity-40",
        error
          ? "animate-shake border-error focus-visible:border-error"
          : "border-input focus-visible:border-teal-700 dark:focus-visible:border-accent",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
