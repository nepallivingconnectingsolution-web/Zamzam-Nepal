import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The phone frame every in-app screen renders inside.
 *
 * On a phone this is invisible — the frame simply fills the screen. On a
 * desktop browser it centres the app at a real phone width on a backdrop,
 * so the product reads as an application rather than a narrow content column
 * stranded in a wide empty page (which is the shape of a blog, and was
 * exactly why these screens felt like a website).
 *
 * `translateZ(0)` at lg is load-bearing, NOT a perf hack: a transformed
 * ancestor becomes the containing block for `position: fixed` descendants.
 * That re-anchors the bottom tab bar and every sticky action bar to this
 * frame instead of the viewport. Remove it and they escape to full width.
 *
 * Caveat worth knowing: Tailwind breakpoints key off the VIEWPORT, not this
 * frame. Inside it, `lg:` still fires on a desktop screen even though the
 * frame is 440px — so screens rendered here must not carry desktop-only
 * layout classes. See the booking pages, which had their two-column desktop
 * layouts removed for this reason.
 */
export function AppFrame({
  children,
  className,
  /** Scrolls the frame's interior instead of the page. Shells want this. */
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div className="min-h-screen bg-bg lg:bg-teal-900/[0.06] lg:py-6 dark:lg:bg-black/40">
      <div
        className={cn(
          "mx-auto flex w-full max-w-[440px] flex-col bg-bg min-h-screen",
          "lg:min-h-0 lg:h-[calc(100vh-3rem)] lg:overflow-hidden lg:rounded-[2rem] lg:shadow-e2",
          "lg:[transform:translateZ(0)]",
          fill && "lg:overflow-hidden",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
