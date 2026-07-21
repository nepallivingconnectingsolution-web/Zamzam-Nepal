import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-9 items-center justify-center overflow-hidden rounded-full bg-brand-900 text-xs font-semibold text-white dark:bg-white dark:text-brand-900",
        className,
      )}
    >
      {src ? <img src={src} alt={name} className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
