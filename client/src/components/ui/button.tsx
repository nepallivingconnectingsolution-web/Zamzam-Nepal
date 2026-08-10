import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button system.
 *
 * Radius is 12px, never a full pill — a pill primary on every screen is one
 * of the fastest ways for an app to read as templated.
 *
 * The primary fill is amber-500 with INK text, not white: pure white on
 * amber is harsh and fails the softness the rest of the system holds. Only
 * one filled amber button should exist per screen; if a screen needs two,
 * the second one is a `secondary`.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "font-display text-body font-semibold",
    "transition-[transform,background-color,border-color,color] duration-fast ease-standard",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:outline-none",
    "[&_svg]:size-[18px] [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // THE primary. Amber fill, ink text. One per screen.
        accent: "bg-amber-500 text-amber-fg hover:bg-accent-600",
        // Alias kept so existing `variant="primary"` call sites don't become
        // a second competing style; deep teal, used where amber is already
        // spent on the screen's real primary action.
        primary: "bg-teal-700 text-white hover:bg-teal-900",
        secondary: "border border-teal-700 bg-transparent text-teal-700 hover:bg-teal-100 dark:border-accent dark:text-accent dark:hover:bg-accent/10",
        outline: "border border-teal-700 bg-transparent text-teal-700 hover:bg-teal-100 dark:border-accent dark:text-accent dark:hover:bg-accent/10",
        // Text-only. Underline appears on press, never at rest.
        tertiary: "text-teal-700 hover:underline dark:text-accent",
        link: "text-teal-700 underline-offset-4 hover:underline dark:text-accent",
        ghost: "text-fg hover:bg-surface-2",
        subtle: "bg-surface-2 text-fg hover:bg-muted",
        // Destructive. Border appears only on press — a permanently
        // outlined delete button shouts before it's been chosen.
        danger: "text-error hover:bg-error/10 active:ring-1 active:ring-error",
        destructive: "text-error hover:bg-error/10 active:ring-1 active:ring-error",
      },
      size: {
        sm: "h-9 px-3.5 text-body-sm",
        md: "h-11 px-5",
        lg: "h-[52px] px-6 text-h2",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "accent", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Swaps the label for a spinner WITHOUT changing the button's width. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* The label stays mounted and simply goes invisible while loading, so
          the button keeps its exact width. Buttons that shrink to fit a
          spinner are the single fastest tell of an unfinished UI. */}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner />
        </span>
      )}
    </button>
  ),
);
Button.displayName = "Button";

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 animate-spin" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export { buttonVariants };
