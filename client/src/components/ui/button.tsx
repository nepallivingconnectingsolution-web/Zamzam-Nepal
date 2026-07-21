import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-brand-800 to-brand-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_2px_rgba(2,6,23,0.35)] hover:from-brand-700 hover:to-brand-900 dark:from-white dark:to-brand-50 dark:text-brand-900 dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] dark:hover:to-brand-100",
        accent:
          "bg-gradient-to-b from-emerald-400 to-accent-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_3px_rgba(13,38,33,0.25)] hover:shadow-glow hover:saturate-[1.15]",
        outline:
          "border border-border bg-surface text-fg shadow-[0_1px_2px_rgba(13,38,33,0.06)] hover:border-accent/40 hover:bg-surface-2",
        ghost: "hover:bg-surface-2 text-fg",
        subtle: "bg-surface-2 text-fg hover:bg-muted",
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
