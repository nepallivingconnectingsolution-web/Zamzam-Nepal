import { cn } from "@/lib/utils";

export function Logo({ className, mono = false }: { className?: string; mono?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-brand-900 dark:bg-white">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path d="M6 6h11l-7 6.5H16L6 18V6z" className="fill-accent" />
        </svg>
      </span>
      {!mono && (
        <span className="font-display text-lg font-extrabold tracking-tight">zamzam</span>
      )}
    </span>
  );
}
