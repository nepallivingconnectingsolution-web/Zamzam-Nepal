import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Marketing section shell with consistent vertical rhythm + eyebrow. */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  intro?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("py-20 sm:py-28", className)}>
      <div className="container">
        {(eyebrow || title) && (
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {title}
              </h2>
            )}
            {intro && <p className="mt-4 text-muted-fg text-balance">{intro}</p>}
          </div>
        )}
        <div className={cn(eyebrow || title ? "mt-14" : "")}>{children}</div>
      </div>
    </section>
  );
}
