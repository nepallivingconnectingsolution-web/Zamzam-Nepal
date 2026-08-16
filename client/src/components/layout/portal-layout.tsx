import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import { PORTAL_NAV, ROLE_HOME, type PortalNavRole } from "@/config";
import type { Role } from "@/types";
import { Logo } from "./logo";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NotificationBell } from "./NotificationBell";
import { AppFrame } from "./app-frame";
import { CustomerShell } from "./customer-shell";
import { DriverShell } from "./driver-shell";
import { RouteFallback } from "@/components/shared/route-fallback";
import { ErrorBoundary } from "@/components/shared/error-boundary";

/**
 * Partner / admin portal shell.
 *
 * One layout at every width: the phone frame, a bottom tab bar carrying the
 * first four nav items, and everything else behind "More".
 *
 * This used to keep a 260px sidebar at `lg` on the reasoning that partner
 * portals are desk software. That reasoning was wrong for this product. Zamzam
 * ships as a single installed app, so a bus operator gets the tab bar on their
 * phone regardless — and maintaining a second desktop-only navigation meant
 * the same portal was a different product depending on the screen it opened
 * on, with the desktop half reading as a website. A hotel owner checking
 * tonight's bookings is doing it on a phone; the desk case is the rare one,
 * and it is served perfectly well by the same layout.
 *
 * Dense content (booking tables, ledgers) still works here — those tables
 * scroll horizontally inside their own container rather than forcing the page
 * wide.
 */
export function PortalLayout({ role }: { role: Exclude<Role, "guest"> }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuthStore();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the "More" sheet on navigation.
  useEffect(() => setMoreOpen(false), [location.pathname]);

  // Customer and driver have purpose-built shells of their own. These guards
  // sit above the PORTAL_NAV lookup on purpose: PORTAL_NAV no longer has keys
  // for those two roles, and returning here first is what narrows `role` to
  // PortalNavRole so the lookup below type-checks.
  if (role === "customer") return <CustomerShell />;
  if (role === "driver") return <DriverShell />;

  const nav = PORTAL_NAV[role];
  const primary = nav.items.slice(0, 4);
  const overflow = nav.items.slice(4);

  const tabs: TabBarItem[] = [
    ...primary.map((item) => ({
      label: item.label,
      icon: item.icon,
      to: item.to,
      end: item.to === ROLE_HOME[role],
    })),
    ...(overflow.length > 0
      ? [
          {
            label: "More",
            icon: "MoreHorizontal",
            action: { onClick: () => setMoreOpen(true), active: moreOpen },
          } satisfies TabBarItem,
        ]
      : []),
  ];

  function handleSignOut() {
    signOut();
    setMoreOpen(false);
    navigate("/");
  }

  return (
    <AppFrame fill>
      <Topbar role={role} navTitle={nav.title} />

      {/* 6rem clears the tab bar, which is taller than it looks — the active
          tab's label sits below its icon. At lg the frame has a fixed height,
          so this element is the scroll container rather than the page body.
          lg:max-w-6xl is wider than the customer/driver shells since these
          portals show tables and ledgers that benefit from the extra room. */}
      <main className="min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:overflow-y-auto lg:px-10">
        <div className="lg:mx-auto lg:max-w-6xl">
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <TabBar items={tabs} />

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-1 pb-2">
          {overflow.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-body font-medium text-fg transition-colors duration-fast ease-standard active:bg-surface-2"
            >
              <Icon name={item.icon} className="size-[18px] text-muted-fg" />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-body font-semibold text-error transition-colors duration-fast ease-standard active:bg-error/10"
          >
            <LogOut className="size-[18px]" />
            Sign out
          </button>
        </div>
      </BottomSheet>
    </AppFrame>
  );
}

function Topbar({ role, navTitle }: { role: PortalNavRole; navTitle: string }) {
  const { user, previewRole, signOut } = useAuthStore();
  const navigate = useNavigate();
  const name = user?.name ?? "Guest user";

  const settingsItem = PORTAL_NAV[role].items.find((item) => item.icon === "Settings");

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  function handleSignOut() {
    signOut();
    setProfileOpen(false);
    navigate("/");
  }

  return (
   <header className="sticky top-0 z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:px-10">
      <Link to={ROLE_HOME[role]} className="flex min-w-0 items-center gap-2" aria-label="Zamzam home">
        <Logo />
        {/* Which portal you're in. The sidebar used to say this above its nav
            list; with the sidebar gone it would otherwise be nowhere, and
            every partner portal would look identical at a glance. */}
        <span className="truncate text-caption font-semibold uppercase tracking-wider text-muted-fg">
          {navTitle}
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell />
        <ThemeToggle />

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            aria-label="Account menu"
            // Avatar only. The name and chevron used to appear from `sm` up,
            // but Tailwind breakpoints key off the viewport, not this 440px
            // frame — so on a desktop screen they claimed ~100px inside the
            // frame and clipped the portal title next to the logo. The name
            // is already in the menu this button opens.
            className="ml-1 flex items-center rounded-full border border-border p-1 transition-colors duration-fast ease-standard hover:bg-surface-2"
          >
            <Avatar name={previewRole === "guest" ? "Guest" : name} className="size-7" />
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl bg-card shadow-e2"
              >
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Avatar name={name} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold">{name}</p>
                    <p className="truncate text-body-sm text-muted-fg">
                      {user?.email ?? user?.mobile ?? ""}
                    </p>
                  </div>
                </div>
                <div className="p-1.5">
                  {settingsItem && (
                    <Link
                      to={settingsItem.to}
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium text-fg transition-colors duration-fast ease-standard hover:bg-surface-2"
                    >
                      <Settings className="size-[18px]" />
                      Account settings
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium text-muted-fg transition-colors duration-fast ease-standard hover:bg-error/10 hover:text-error"
                  >
                    <LogOut className="size-[18px]" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
