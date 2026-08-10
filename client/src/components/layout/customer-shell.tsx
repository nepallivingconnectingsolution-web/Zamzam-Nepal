import { Suspense, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  BedDouble,
  Bus,
  LifeBuoy,
  LogOut,
  Settings,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Logo } from "./logo";
import { AppFrame } from "./app-frame";
import { useAuthStore } from "@/stores/auth.store";
import { FloatingAssistant } from "@/features/customer/assistant/FloatingAssistant";
import { RouteFallback } from "@/components/shared/route-fallback";
import { ErrorBoundary } from "@/components/shared/error-boundary";

const TABS: TabBarItem[] = [
  { label: "Home", to: "/app", icon: "LayoutGrid", end: true },
  { label: "Trips", to: "/app/trips", icon: "Route" },
  { label: "Bookings", to: "/app/bookings", icon: "CalendarCheck" },
  { label: "Wallet", to: "/app/wallet", icon: "Wallet" },
];

/**
 * Customer app shell — a persistent bottom tab bar (max 4-5 items, per the
 * mobile-app mandate) plus a slim top strip for notifications/profile,
 * replacing the desktop sidebar+topbar that PortalLayout still uses for
 * partner/admin portals (those stay deliberately sidebar-based — they're
 * genuinely desk-used management consoles).
 *
 * Anything beyond the 4 primary tabs (support, transactions, settings,
 * sign out) lives behind "More", a bottom sheet rather than a 5th/6th tab.
 */
export function CustomerShell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const tabs: TabBarItem[] = [
    ...TABS,
    { label: "More", icon: "MoreHorizontal", action: { onClick: () => setMoreOpen(true), active: moreOpen } },
  ];

  function handleSignOut() {
    signOut();
    setMoreOpen(false);
    navigate("/");
  }

  return (
    // The frame itself lives in AppFrame — this shell used to carry its own
    // copy of those classes, which then had to be kept in step by hand with
    // the driver, partner and admin shells.
    <AppFrame fill>
      <header className="sticky top-0 z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <Link to="/app" aria-label="Zamzam home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => navigate("/app/settings")}
            aria-label="Account"
            className="ml-1 rounded-full active:scale-95"
          >
            <Avatar name={user?.name ?? "Guest"} className="size-8" />
          </button>
        </div>
      </header>

      {/* 6rem clears the tab bar, which is taller than it looks: the active
          tab's label sits below the icon.
          At lg the frame has a fixed height, so this is the scroll container
          rather than the page body. */}
      <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:overflow-y-auto">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <TabBar items={tabs} />
      <FloatingAssistant />

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-5 pb-2">
          {/* Services carried a dedicated sidebar entry each in the previous
              layout. When the sidebar became a 5-slot tab bar they were left
              reachable only via the Home marketplace tiles — which quietly
              made Buses unreachable entirely while its tile pointed at a
              dead route. They're restored here as a group so every service
              is still one tap from anywhere, not just from Home. */}
          <div>
            <p className="px-3 pb-1.5 text-caption font-semibold uppercase tracking-wider text-muted-fg">
              Services
            </p>
            <div className="space-y-0.5">
              <ShellLink to="/app/buses" icon={Bus} label="Buses" onNavigate={() => setMoreOpen(false)} />
              <ShellLink to="/app/hotels" icon={BedDouble} label="Hotels" onNavigate={() => setMoreOpen(false)} />
              <ShellLink to="/app/restaurants" icon={UtensilsCrossed} label="Food" onNavigate={() => setMoreOpen(false)} />
              <ShellLink to="/app/grocery" icon={ShoppingBasket} label="Grocery" onNavigate={() => setMoreOpen(false)} />
            </div>
          </div>

          <div>
            <p className="px-3 pb-1.5 text-caption font-semibold uppercase tracking-wider text-muted-fg">
              Account
            </p>
            <div className="space-y-0.5">
              <ShellLink to="/app/transactions" icon={ArrowLeftRight} label="Transactions" onNavigate={() => setMoreOpen(false)} />
              <ShellLink to="/app/support" icon={LifeBuoy} label="Support" onNavigate={() => setMoreOpen(false)} />
              <ShellLink to="/app/settings" icon={Settings} label="Settings" onNavigate={() => setMoreOpen(false)} />
            </div>
          </div>

          {/* The only place amber is forbidden and error-red is correct —
              Profile/More is the quietest surface in the app, and its one
              loud element should be the destructive action. */}
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

function ShellLink({
  to,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: typeof Settings;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md px-3 py-3 text-body font-medium text-fg transition-colors duration-fast ease-standard active:bg-surface-2"
    >
      <Icon className="size-[18px] text-muted-fg" />
      {label}
    </Link>
  );
}
