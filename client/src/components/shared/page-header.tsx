import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-gradient-to-r from-accent to-accent-300" />
        <h1 className="bg-gradient-to-br from-fg to-fg/60 bg-clip-text font-display text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-fg">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
