import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends Omit<InputProps, "type"> {
  /** Optional leading icon element (e.g. <Lock className="..." />), positioned the same way callers already position their left icons. */
  leadingIcon?: React.ReactNode;
}

/**
 * Password field with a built-in show/hide toggle (eye icon). Wraps the
 * shared `Input` component so it keeps the same styling, just adds the
 * `relative` positioning + toggle button that was previously only present
 * on the super-admin login page. Use this anywhere a password is collected
 * instead of a raw `<Input type="password" />`.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, leadingIcon, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        {leadingIcon}
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn(leadingIcon ? "pl-9" : undefined, "pr-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";