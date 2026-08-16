import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The shell every in-app screen renders inside.
 *
 * On a phone this is invisible — it simply fills the screen, unchanged from
 * before. On a desktop browser it now fills the full browser width instead
 * of floating as a narrow phone-width card on a grey backdrop, so the app
 * reads as a real website at that size. Each screen is responsible for its
 * own comfortable content width inside this shell (see customer-shell.tsx,
 * driver-shell.tsx, portal-layout.tsx, SuperAdminLayout.tsx, AppHome.tsx),
 * the same way a login form centres itself in a narrow card without the
 * shell forcing it.
 *
 * `fill` is kept for backwards compatibility with existing call sites even
 * though it's currently a no-op — it previously toggled frame-level scroll
 * containment for the floating-card desktop treatment, which no longer
 * exists now that the shell is full width.
 */
export function AppFrame({
  children,
  className,
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  fill?: boolean;
}) {
  void fill;
  return (
    <div className="min-h-screen bg-bg">
      <div
        className={cn("mx-auto flex w-full max-w-[440px] flex-col bg-bg min-h-screen", "lg:max-w-none", className)}
      >
        {children}
      </div>
    </div>
  );
}