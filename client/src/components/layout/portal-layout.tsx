import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui.store";
import { useAuthStore } from "@/stores/auth.store";
import { PORTAL_NAV, ROLE_HOME } from "@/config";
import type { Role } from "@/types";
import { Logo } from "./logo";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "./NotificationBell";
import { FloatingAssistant } from "@/features/customer/assistant/FloatingAssistant";

export function PortalLayout({ role }: { role: Exclude<Role, "guest"> }) {
  const { sidebarOpen, setSidebar } = useUiStore();
  const location = useLocation();
  const nav = PORTAL_NAV[role];

  // Close the mobile drawer on navigation.
  useEffect(() => setSidebar(false), [location.pathname, setSidebar]);

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <SidebarBody role={role} navTitle={nav.title} className="hidden lg:flex" />

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebar(false)}
              className="fixed inset-0 z-40 bg-brand-950/50 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed left-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-50 w-[260px] lg:hidden"
            >
              <SidebarBody role={role} navTitle={nav.title} className="flex h-full" withClose />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <Topbar role={role} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating assistant — customer portal only, available on every page */}
      {role === "customer" && <FloatingAssistant />}
    </div>
  );
}

function SidebarBody({
  role,
  navTitle,
  className,
  withClose,
}: {
  role: Exclude<Role, "guest">;
  navTitle: string;
  className?: string;
  withClose?: boolean;
}) {
  const { setSidebar } = useUiStore();
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const nav = PORTAL_NAV[role];

  function handleSignOut() {
    signOut();
    setSidebar(false);
    navigate("/");
  }

  return (
    <aside className={cn("flex-col border-r border-border bg-surface", className)}>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
        <Link to={ROLE_HOME[role]} aria-label="Zamzam home">
          <Logo />
        </Link>
        {withClose && (
          <Button variant="ghost" size="icon" onClick={() => setSidebar(false)} aria-label="Close menu">
            <X className="size-5" />
          </Button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-fg">
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
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-gradient-to-r from-brand-900 to-brand-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_14px_-6px_rgba(2,6,23,0.5)] ring-1 ring-white/10 dark:from-white dark:to-brand-50 dark:text-brand-900 dark:shadow-[0_4px_14px_-6px_rgba(0,0,0,0.5)] dark:ring-black/5"
                      : "text-muted-fg hover:translate-x-0.5 hover:bg-surface-2 hover:text-fg",
                  )
                }
              >
                <Icon name={item.icon} className="size-[18px]" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer — user info + sign out, present on every portal */}
      <div className="shrink-0 space-y-1 border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar name={user?.name ?? "Guest"} className="size-7" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{user?.name ?? "Guest user"}</p>
            <p className="truncate text-[10px] text-muted-fg">{user?.email ?? user?.mobile ?? ""}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-fg transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        >
          <LogOut className="size-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function Topbar({ role }: { role: Exclude<Role, "guest"> }) {
  const { setSidebar } = useUiStore();
  const { user, previewRole, signOut } = useAuthStore();
  const navigate = useNavigate();
  const name = user?.name ?? "Guest user";

  // Only shown when this portal actually has a settings page (customer,
  // admin). Roles without one just don't get the menu item.
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
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [profileOpen]);

  function handleSignOut() {
    signOut();
    setProfileOpen(false);
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b border-border bg-bg/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebar(true)}
        aria-label="Open menu"
      >
        <Menu />
      </Button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
        <Input placeholder="Search Zamzam…" className="pl-9" />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell />
        <ThemeToggle />

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="ml-1 flex items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-surface-2"
          >
            <Avatar name={name} className="size-7" />
            <span className="hidden text-sm font-medium sm:block">
              {previewRole === "guest" ? "Guest" : name}
            </span>
            <ChevronDown
              className={cn(
                "hidden size-3.5 text-muted-fg transition-transform sm:block",
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
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
              >
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Avatar name={name} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{name}</p>
                    <p className="truncate text-xs text-muted-fg">{user?.email ?? user?.mobile ?? ""}</p>
                  </div>
                </div>
                <div className="p-1.5">
                  {settingsItem && (
                    <Link
                      to={settingsItem.to}
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
                    >
                      <Settings className="size-[18px]" />
                      Account settings
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-fg transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
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