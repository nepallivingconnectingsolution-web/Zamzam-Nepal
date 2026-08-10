import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Level 2 — floating/sticky surfaces only (booking bar, FAB, sheet). */
  elevated?: boolean;
  /** Adds 0.98 press feedback. Set on every tappable card, no exceptions. */
  interactive?: boolean;
}

/**
 * Card.
 *
 * Level 1 is a hairline border and NO shadow. That's the default state for
 * every card in the app. Level 2 (border + one soft shadow) is reserved for
 * things that genuinely float above the page — the sticky booking bar, the
 * FAB, an open sheet. There is no level 3; the previous gradient-fill +
 * inner-highlight + hover-lift treatment has been removed, because stacked
 * decoration is what made cards read as "component library" rather than
 * "product".
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-xl bg-card",
        elevated ? "shadow-e2" : "shadow-e1",
        interactive && "transition-transform duration-fast ease-standard active:scale-[0.98]",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("font-display text-h2 font-bold", className)} {...props} />
);

export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-body text-muted-fg", className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5 pt-0", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center gap-2 p-5 pt-0", className)} {...props} />
);
