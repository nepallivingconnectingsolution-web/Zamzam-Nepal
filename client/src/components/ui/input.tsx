import * as React from "react";
import { cn } from "@/lib/utils";

   export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
       "flex h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm text-fg shadow-[inset_0_1px_2px_rgba(13,38,33,0.05)] placeholder:text-muted-fg transition-all duration-200 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
