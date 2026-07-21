import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  BrainCircuit,
  Building2,
  Car,
  FileText,
  Gauge,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  LogOut,
  Map,
  Menu,
  ScrollText,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui.store";
import { useSuperAdminStore } from "@/stores/super-admin.store";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/features/super-admin/NotificationBell";


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

export function SuperAdminLayout() {
  const { sidebarOpen, setSidebar } = useUiStore();
  const location = useLocation();

  useEffect(() => setSidebar(false), [location.pathname, setSidebar]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg lg:grid lg:grid-cols-[260px_1fr]">
      <SidebarBody className="hidden lg:flex" />

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
              className="fixed inset-y-0 left-0 z-50 w-[260px] lg:hidden"
            >
              <SidebarBody className="flex h-full" withClose />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-col">
        <SuperTopbar />
       <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarBody({
  className,
  withClose,
}: {
  className?: string;
  withClose?: boolean;
}) {
  const { setSidebar } = useUiStore();
  const { admin, clearSession } = useSuperAdminStore();
  const navigate = useNavigate();

  function handleSignOut() {
    clearSession();
    navigate("/");
  }

  return (
    <aside className={cn("flex-col border-r border-border bg-surface", className)}>
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-brand-900">
            <ShieldAlert className="size-4 text-white" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">
            Super Admin
          </span>
        </div>
        {withClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebar(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-fg">
          Platform Control
        </p>
        <ul className="space-y-0.5">
          {SA_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-900 text-white dark:bg-white dark:text-brand-900"
                      : "text-muted-fg hover:bg-surface-2 hover:text-fg",
                  )
                }
              >
                <item.icon className="size-[18px] shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar name={admin?.name ?? "SA"} className="size-7" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {admin?.name ?? "Super Admin"}
            </p>
            <p className="truncate text-[10px] text-muted-fg">
              {admin?.email ?? ""}
            </p>
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

function SuperTopbar() {
  const { setSidebar } = useUiStore();
  const { admin } = useSuperAdminStore();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebar(true)}
        aria-label="Open menu"
      >
        <Menu />
      </Button>

      <span className="rounded-md bg-brand-900/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-brand-900 dark:bg-white/10 dark:text-white">
        Super Admin
      </span>

      <div className="ml-auto flex items-center gap-1.5">
         <NotificationBell />
        <ThemeToggle />
        <div className="ml-1 flex items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-3">
          <Avatar name={admin?.name ?? "SA"} className="size-7" />
          <span className="hidden text-sm font-medium sm:block">
            {admin?.name ?? "Super Admin"}
          </span>
        </div>
      </div>
    </header>
  );
}