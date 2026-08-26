import { cn } from "@/lib/utils";
import glyph from "@/assets/brand/logo-glyph.png";

export function Logo({ className, mono = false }: { className?: string; mono?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {/* Brand mark — the blue Z shopping-bag glyph on its own white tile. The
          glyph art is already on white, so the tile blends into it; a hairline
          ring separates it from light page surfaces. */}
      <span className="grid size-8 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-black/5 dark:ring-white/10">
        <img src={glyph} alt="" aria-hidden className="size-full object-contain" />
      </span>
      {!mono && (
        <span className="font-display text-lg font-extrabold tracking-tight">zamzam</span>
      )}
    </span>
  );
}
