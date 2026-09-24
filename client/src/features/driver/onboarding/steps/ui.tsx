import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A labelled form field with its own inline error, wired for screen readers. */
export function Field({
  label, required, error, hint, htmlFor, children, className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-fg">
        {label}
        {required && <span className="ml-0.5 text-error" aria-label="required">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-fg">{hint}</p>}
      {error && (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs font-medium text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Title, intro and the Back / Save & continue footer every step shares. */
export function StepShell({
  title, intro, children, onBack, onNext, nextLabel = "Save & continue", nextDisabled, saving, error, footerNote,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
  error?: string | null;
  footerNote?: ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nextDisabled && !saving) onNext();
      }}
      noValidate
      className="space-y-6"
    >
      <div>
        <h2 className="font-display text-h1 font-bold">{title}</h2>
        {intro && <p className="mt-1 text-sm text-muted-fg">{intro}</p>}
      </div>

      <div className="space-y-4">{children}</div>

      {error && (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error" role="alert">
          {error}
        </p>
      )}
      {footerNote}

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {onBack && (
          <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={saving} className="shrink-0">
            <ArrowLeft className="size-4" /> Back
          </Button>
        )}
        <Button type="submit" variant="accent" size="lg" className="flex-1" loading={saving} disabled={nextDisabled}>
          {nextLabel} <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}

/** "Pick one" rows for short lists; a real radio group so it works with a keyboard and a screen reader. */
export const inputClass = "h-11";
