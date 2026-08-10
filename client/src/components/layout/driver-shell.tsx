import { Suspense, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Car, FileCheck, LogOut, Star, Wallet } from "lucide-react";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Logo } from "./logo";
import { useAuthStore } from "@/stores/auth.store";
import { RouteFallback } from "@/components/shared/route-fallback";
import { ErrorBoundary } from "@/components/shared/error-boundary";

const TABS: TabBarItem[] = [
  { label: "Home", to: "/driver", icon: "Gauge", end: true },
  { label: "Requests", to: "/driver/requests", icon: "BellRing" },
  { label: "Trip", to: "/driver/trip", icon: "Navigation" },
  { label: "Earnings", to: "/driver/earnings", icon: "Banknote" },
];

/**
 * Driver portal shell — same bottom-tab pattern as CustomerShell (see that
 * file for the reasoning). Drivers live in this app in-vehicle even more
 * than customers do, so it gets the native treatment too rather than the
 * sidebar+topbar reserved for desk-used partner/admin consoles.
 */
export function DriverShell() {
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
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <Link to="/driver" aria-label="Zamzam driver home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Account"
            className="ml-1 rounded-full active:scale-95"
          >
            <Avatar name={user?.name ?? "Driver"} className="size-8" />
          </button>
        </div>
      </header>

      {/* 6rem — same reasoning as CustomerShell: the tab bar grew when the
          active tab gained a label, and it's translucent. */}
      <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto max-w-lg">
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
          <ShellLink to="/driver/wallet" icon={Wallet} label="Wallet" onNavigate={() => setMoreOpen(false)} />
          <ShellLink to="/driver/ratings" icon={Star} label="Ratings" onNavigate={() => setMoreOpen(false)} />
          <ShellLink to="/driver/vehicle" icon={Car} label="Vehicle" onNavigate={() => setMoreOpen(false)} />
          <ShellLink to="/driver/documents" icon={FileCheck} label="Documents" onNavigate={() => setMoreOpen(false)} />
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-danger transition-colors active:bg-danger/10"
          >
            <LogOut className="size-[18px]" />
            Sign out
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function ShellLink({
  to,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: typeof Wallet;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-fg transition-colors active:bg-surface-2"
    >
      <Icon className="size-[18px] text-muted-fg" />
      {label}
    </Link>
  );
}
