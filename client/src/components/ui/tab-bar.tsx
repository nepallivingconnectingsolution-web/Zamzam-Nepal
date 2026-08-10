import { useId } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { haptics } from "@/lib/native/haptics";

export interface TabBarItem {
  label: string;
  /** Name registered in components/ui/icon.tsx's REGISTRY. */
  icon: string;
  /** Route tab — mutually exclusive with `action`. */
  to?: string;
  end?: boolean;
  /** Non-navigating tab (e.g. "More" opening a sheet) — mutually exclusive with `to`. */
  action?: { onClick: () => void; active?: boolean };
}

/**
 * Bottom tab bar — primary nav for the customer app and driver portal.
 *
 * The label shows on the ACTIVE tab only. Five permanently-labeled tabs is
 * the stock pattern and reads as a template; one label plus four clean
 * glyphs reads as considered, and it's what the tier-1 reference apps
 * (Linear, Cash App, Things) all do. The 3px amber indicator rises from
 * below on the micro easing — the one place the nav is allowed personality.
 */
export function TabBar({ items }: { items: TabBarItem[] }) {
  const indicatorId = useId();

  return (
    <nav
      /* Opaque, not translucent. A blurred see-through bar is the iOS
         house style, but page content stays faintly legible through it and
         collides with the active tab's label — and backdrop-filter isn't
         reliable in every Android WebView this ships to. Solid is the
         choice that always reads clean. */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {items.map((item) => (
          <li key={item.label} className="flex-1">
            {item.action ? (
              <button
                type="button"
                onClick={() => {
                  void haptics.tap();
                  item.action!.onClick();
                }}
                aria-pressed={item.action.active}
                aria-label={item.label}
                className="relative flex w-full flex-col items-center justify-center gap-1 py-2.5"
              >
                <TabContent
                  icon={item.icon}
                  label={item.label}
                  active={!!item.action.active}
                  indicatorId={indicatorId}
                />
              </button>
            ) : (
              <NavLink
                to={item.to!}
                end={item.end}
                onClick={() => void haptics.tap()}
                aria-label={item.label}
                className="relative flex flex-col items-center justify-center gap-1 py-2.5"
              >
                {({ isActive }) => (
                  <TabContent
                    icon={item.icon}
                    label={item.label}
                    active={isActive}
                    indicatorId={indicatorId}
                  />
                )}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TabContent({
  icon,
  label,
  active,
  indicatorId,
}: {
  icon: string;
  label: string;
  active: boolean;
  indicatorId: string;
}) {
  return (
    <>
      {active && (
        <motion.span
          layoutId={`tab-bar-indicator-${indicatorId}`}
          transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
          className="absolute top-0 h-[3px] w-9 rounded-full bg-amber-500"
        />
      )}
      <Icon
        name={icon}
        className={cn(
          "size-[22px] transition-colors duration-fast ease-standard",
          active ? "text-teal-700 dark:text-accent" : "text-muted-fg",
        )}
        /* Active tab reads heavier via stroke weight rather than a second
           icon set — mixing filled and outline families inside one bar is
           exactly the inconsistency the system forbids elsewhere. */
        strokeWidth={active ? 2.25 : 1.5}
      />
      {/* Label on the active tab only. Reserved height keeps the four
          inactive tabs from shifting as the indicator moves between them. */}
      <span className="flex h-[14px] items-center">
        {active && (
          <motion.span
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-caption font-semibold text-teal-700 dark:text-accent"
          >
            {label}
          </motion.span>
        )}
      </span>
    </>
  );
}
