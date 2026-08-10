import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
import { CustomerShell } from "./customer-shell";
import { DriverShell } from "./driver-shell";
import { RouteFallback } from "@/components/shared/route-fallback";
import { ErrorBoundary } from "@/components/shared/error-boundary";

/**
 * Partner / admin portal shell.
 *
 * These portals are genuinely used at a desk — they're dense management
 * consoles with tables and bulk actions — so at `lg` and up they keep a
 * sidebar. But a hotel owner or bus operator checking today's bookings is
 * very often doing it on a phone, and the old mobile treatment was a
 * hamburger opening a slide-out drawer: the website pattern, and the single
 * clearest tell that a screen isn't a real app.
 *
 * Below `lg` the same routes now get the same bottom tab bar the customer
 * and driver apps use — first four nav items as tabs, everything else behind
 * "More". Only the CHROME swaps at the breakpoint; `<Outlet />` is rendered
 * exactly once either way, so route state is never duplicated or remounted.
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
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[260px_1fr]">
      <SidebarBody role={role} navTitle={nav.title} className="hidden lg:flex" />

      <div className="flex min-w-0 flex-col">
        <Topbar role={role} />
        <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
          <div className="mx-auto max-w-7xl">
            <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Mobile-only chrome. The sidebar above is the lg+ equivalent. */}
      <div className="lg:hidden">
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
      </div>
    </div>
  );
}

function SidebarBody({
  role,
  navTitle,
  className,
}: {
  role: PortalNavRole;
  navTitle: string;
  className?: string;
}) {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const nav = PORTAL_NAV[role];

  function handleSignOut() {
    signOut();
    navigate("/");
  }

  return (
    <aside className={cn("flex-col border-r border-border bg-surface", className)}>
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
        <Link to={ROLE_HOME[role]} aria-label="Zamzam home">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-caption font-semibold uppercase tracking-wider text-muted-fg">
          {navTitle}
        </p>
        <ul className="space-y-0.5">
          {nav.items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to.split("/").length <= 2}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition-colors duration-fast ease-standard",
                    isActive
                      ? "bg-teal-700 text-white dark:bg-white dark:text-teal-900"
                      : "text-muted-fg hover:bg-surface-2 hover:text-fg",
                  )
                }
              >
                <Icon name={item.icon} className="size-[18px]" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar name={user?.name ?? "Guest"} className="size-7" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold">{user?.name ?? "Guest user"}</p>
            <p className="truncate text-caption text-muted-fg">{user?.email ?? user?.mobile ?? ""}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium text-muted-fg transition-colors duration-fast ease-standard hover:bg-error/10 hover:text-error"
        >
          <LogOut className="size-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function Topbar({ role }: { role: PortalNavRole }) {
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
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-border bg-bg/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6 lg:h-[calc(4rem+env(safe-area-inset-top))] lg:px-8">
      {/* Logo shows on mobile only — on lg the sidebar already carries it.
          There's no hamburger any more: the bottom tab bar replaced the
          slide-out drawer below lg. */}
      <Link to={ROLE_HOME[role]} className="lg:hidden" aria-label="Zamzam home">
        <Logo />
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
            className="ml-1 flex items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-1 transition-colors duration-fast ease-standard hover:bg-surface-2 sm:pr-3"
          >
            <Avatar name={name} className="size-7" />
            <span className="hidden text-body font-medium sm:block">
              {previewRole === "guest" ? "Guest" : name}
            </span>
            <ChevronDown
              className={cn(
                "hidden size-3.5 text-muted-fg transition-transform duration-fast ease-standard sm:block",
                profileOpen && "rotate-180",
              )}
            />
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
