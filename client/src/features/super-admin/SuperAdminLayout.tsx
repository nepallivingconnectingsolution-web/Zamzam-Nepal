import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  BrainCircuit,
  Building2,
  Car,
ChevronDown,
  FileCheck,
  FileText,
  Gauge,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  LogOut,
  Map,
  ScrollText,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuperAdminStore } from "@/stores/super-admin.store";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AppFrame } from "@/components/layout/app-frame";
import { NotificationBell } from "@/features/super-admin/NotificationBell";
import { RouteFallback } from "@/components/shared/route-fallback";
import { ErrorBoundary } from "@/components/shared/error-boundary";


interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const SA_NAV: NavItem[] = [
  { label: "Overview",       to: "/x-admin",               icon: Gauge,          end: true },
  { label: "Users",          to: "/x-admin/users",          icon: Users },
  { label: "Approvals",      to: "/x-admin/approvals",      icon: UserCheck },
  { label: "Notifications", to: "/x-admin/notifications", icon: Bell },
  { label: "Drivers",        to: "/x-admin/drivers",        icon: Car },
 { label: "Partners",       to: "/x-admin/partners",       icon: Building2 },
  { label: "Partner Docs",   to: "/x-admin/partner-documents", icon: FileCheck },
  { label: "Wallet & Ledger",to: "/x-admin/wallet",         icon: Wallet },
  { label: "Transactions",   to: "/x-admin/transactions",   icon: ArrowLeftRight },
  { label: "Rides",          to: "/x-admin/rides",          icon: Activity },
  { label: "Services",       to: "/x-admin/services",       icon: LayoutGrid },
  { label: "Disputes",       to: "/x-admin/disputes",       icon: AlertTriangle },
  { label: "Revenue",        to: "/x-admin/revenue",        icon: TrendingUp },
  { label: "AI & Fraud",     to: "/x-admin/ai",             icon: BrainCircuit },
  { label: "Demand Heatmap", to: "/x-admin/heatmap",        icon: Map },
  { label: "CMS",            to: "/x-admin/cms",            icon: LayoutTemplate },
  { label: "Roles",          to: "/x-admin/roles",          icon: KeyRound },
  { label: "Audit Log",      to: "/x-admin/audit",          icon: ScrollText },
  { label: "Reports",        to: "/x-admin/reports",        icon: FileText },
  { label: "Settings",       to: "/x-admin/settings",       icon: Settings },
];

/**
 * The four surfaces a super admin actually opens daily — the dashboard, the
 * queue of things waiting on a decision, the partner roster, and the money
 * ledger. Everything else is periodic and lives behind "More".
 */
const SA_TABS: TabBarItem[] = [
  { label: "Overview", to: "/x-admin", icon: "Gauge", end: true },
  { label: "Approvals", to: "/x-admin/approvals", icon: "ShieldCheck" },
  { label: "Partners", to: "/x-admin/partners", icon: "Building2" },
  { label: "Ledger", to: "/x-admin/transactions", icon: "ArrowLeftRight" },
];

/**
 * The remaining 16 destinations, grouped by what they're FOR. A flat list of
 * sixteen links in a sheet is just the old drawer with a different animation;
 * grouping is what makes this actually easier to navigate than what it
 * replaced. Kept in sync with SA_NAV above by path.
 */
const MORE_GROUPS: { title: string; paths: string[] }[] = [
  { title: "People", paths: ["/x-admin/users", "/x-admin/drivers", "/x-admin/partner-documents"] },
  { title: "Money", paths: ["/x-admin/wallet", "/x-admin/revenue", "/x-admin/reports"] },
  {
    title: "Operations",
    paths: ["/x-admin/rides", "/x-admin/services", "/x-admin/disputes", "/x-admin/heatmap"],
  },
  {
    title: "Platform",
    paths: [
      "/x-admin/notifications",
      "/x-admin/ai",
      "/x-admin/cms",
      "/x-admin/roles",
      "/x-admin/audit",
      "/x-admin/settings",
    ],
  },
];

export function SuperAdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearSession } = useSuperAdminStore();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  // Deliberately a find() rather than a `new Map(...)`: this module imports
  // lucide's `Map` icon, which shadows the global Map constructor.
  const byPath = (path: string) => SA_NAV.find((item) => item.to === path);

  const tabs: TabBarItem[] = [
    ...SA_TABS,
    { label: "More", icon: "MoreHorizontal", action: { onClick: () => setMoreOpen(true), active: moreOpen } },
  ];

  function handleSignOut() {
    clearSession();
    setMoreOpen(false);
    navigate("/");
  }

  return (
    // One layout at every width, like the customer app and the partner
    // portals. The 260px sidebar this replaces made the console a different
    // product on a laptop than on a phone; the tab bar below was already
    // carrying the whole navigation under lg.
    <AppFrame fill>
      <SuperTopbar />
      {/* lg:max-w-6xl mirrors PortalLayout — this console shows the same
          kind of dense tables/charts and benefits from the extra width. */}
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:overflow-y-auto lg:px-10">
        <div className="lg:mx-auto lg:max-w-6xl">
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <div>
        <TabBar items={tabs} />

        <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
          <div className="space-y-5 pb-2">
            {MORE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-3 pb-1.5 text-caption font-semibold uppercase tracking-wider text-muted-fg">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.paths.map((path) => {
                    const item = byPath(path);
                    if (!item) return null;
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium text-fg transition-colors duration-fast ease-standard active:bg-surface-2"
                      >
                        <item.icon className="size-[18px] text-muted-fg" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
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
    </AppFrame>
  );
}

function SuperTopbar() {
  const { admin, clearSession } = useSuperAdminStore();
  const navigate = useNavigate();
  const name = admin?.name ?? "Super Admin";

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
    clearSession();
    setProfileOpen(false);
    navigate("/");
  }

return (
    <header className="sticky top-0 z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-border bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:px-10">
      {/* No hamburger: the bottom tab bar replaced the slide-out drawer. */}
      <span className="rounded-sm bg-teal-100 px-2 py-1 text-caption font-bold uppercase tracking-widest text-teal-700 dark:bg-white/10 dark:text-white">
        Super Admin
      </span>

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
            // Avatar only — same reason as PortalLayout's: `sm:` fires on the
            // desktop viewport, not on this 440px frame, so the name claimed
            // space the frame doesn't have. It's in the menu this opens.
            className="ml-1 flex items-center rounded-full border border-border p-1 transition-colors hover:bg-surface-2"
          >
            <Avatar name={name} className="size-7" />
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
                    <p className="truncate text-xs text-muted-fg">{admin?.email ?? ""}</p>
                  </div>
                </div>
                <div className="p-1.5">
                  <Link
                    to="/x-admin/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
                  >
                    <Settings className="size-[18px]" />
                    Account settings
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger"
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