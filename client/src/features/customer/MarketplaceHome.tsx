import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  Car,
  CheckCircle2,
  Circle,
  LoaderCircle,
  MapPin,
  Package,
  Route,
  Sparkles,
} from "lucide-react";
import { ServiceGrid } from "@/components/shared/service-grid";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { npr } from "@/lib/utils";
import { SERVICE_GROUPS, SERVICES } from "@/config";
import { Icon } from "@/components/ui/icon";

interface WalletSummary {
  balance: number;
  currency: string;
}

interface RideTrip {
  id: string;
  service: "taxi" | "bike" | "parcel";
  from: string;
  to: string;
  fare: number;
  status: "COMPLETED" | "CANCELLED" | "ONGOING" | "REQUESTED" | "ACCEPTED";
  createdAt: string;
}

interface ActiveRide {
  id: string;
  service: "taxi" | "bike" | "parcel";
  from: string;
  to: string;
  fare: number;
  status: "REQUESTED" | "ACCEPTED" | "ONGOING";
  driverName: string | null;
  vehiclePlate: string | null;
}

const SERVICE_ICON = { taxi: Car, bike: Bike, parcel: Package } as const;
const STATUS_VARIANT: Record<RideTrip["status"], "success" | "danger" | "outline" | "accent"> = {
  COMPLETED: "success",
  CANCELLED: "danger",
  ONGOING: "accent",
  REQUESTED: "outline",
  ACCEPTED: "outline",
};

export function MarketplaceHome() {
  const navigate = useNavigate();
  const wallet = useResource<WalletSummary>(() => api.get(endpoints.wallet.balance));

  // Polled so "Recent activity" catches up on its own once a trip finishes,
  // instead of only updating on the next full page load.
  const trips = useResource<RideTrip[]>(() => api.get(endpoints.rides.history), [], {
    refreshInterval: 8000,
  });

  // Polled so a driver-side "Complete trip" is reflected here live — this is
  // the same live-status pattern the booking page uses, surfaced on the
  // marketplace home too since that's often the screen left open.
  const activeRide = useResource<ActiveRide | null>(() => api.get(endpoints.rides.active), [], {
    refreshInterval: 5000,
  });
  const ride = activeRide.data ?? null;

  // Toast + refresh "Recent activity" the moment the active ride disappears
  // *because it finished* (previous status ONGOING → now null). A ride that
  // disappears from REQUESTED/ACCEPTED is a cancellation, not a completion,
  // so it's deliberately excluded here.
  const prevRide = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (activeRide.state === "idle" || activeRide.state === "loading") return;
    if (!ride && prevRide.current?.status === "ONGOING") {
      toast.success("Trip completed", "Thanks for riding with Zamzam — it's now in your trip history.");
      trips.refetch();
    }
    prevRide.current = ride ? { id: ride.id, status: ride.status } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride, activeRide.state]);

  return (
    <div className="space-y-8">
      {/* Greeting + quick wallet */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Good day 👋</h1>
          <p className="mt-1 text-sm text-muted-fg">Where would you like to go today?</p>
        </div>
        <Card className="flex items-center gap-4 px-5 py-3">
          <div>
            <p className="text-xs text-muted-fg">Zamzam Pay</p>
            <p className="font-display text-lg font-bold">
              {wallet.state === "success" && wallet.data
                ? new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(
                    wallet.data.balance,
                  )
                : "रू —"}
            </p>
          </div>
          <Button size="sm" variant="accent" onClick={() => navigate("/app/wallet")}>
            Top up
          </Button>
        </Card>
      </div>

      {/* Live active trip — only rendered while one exists, updates on its own */}
      {ride && (
        <Card className="space-y-3 border-accent/40 bg-accent/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {ride.status === "REQUESTED" ? (
                <LoaderCircle className="size-4 animate-spin text-accent" />
              ) : (
                <CheckCircle2 className="size-4 text-accent" />
              )}
              <h3 className="text-sm font-semibold">
                {ride.status === "REQUESTED" && "Finding you a driver…"}
                {ride.status === "ACCEPTED" && "Driver on the way"}
                {ride.status === "ONGOING" && "Trip in progress"}
              </h3>
            </div>
            <Badge variant={ride.status === "REQUESTED" ? "warning" : "success"} className="capitalize">
              {ride.status.toLowerCase()}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Circle className="size-3 fill-accent text-accent" /> {ride.from}
              <MapPin className="size-4 shrink-0 text-danger" /> {ride.to}
            </p>
            <div className="flex items-center gap-3">
              {ride.driverName && (
                <span className="text-xs text-muted-fg">
                  {ride.driverName}
                  {ride.vehiclePlate ? ` · ${ride.vehiclePlate.toUpperCase()}` : ""}
                </span>
              )}
              <span className="font-display text-sm font-semibold">{npr(ride.fare)}</span>
              <Button size="sm" variant="outline" onClick={() => navigate(`/app/book/${ride.service}`)}>
                Track trip
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* The marketplace */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">Marketplace</h2>
          <Badge variant="accent">
            <Sparkles className="size-3" /> AI picks your best route
          </Badge>
        </div>
        <ServiceGrid linked compact />
      </section>

      {/* AI cross-sell strip — a real surface, empty until the engine has context */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent-600 dark:text-accent">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h3 className="font-display font-semibold tracking-tight">Suggestions for you</h3>
              <p className="text-sm text-muted-fg">
                Personalised bundles appear here as the assistant learns your trips.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/app/assistant")}>
            Open assistant <ArrowRight className="size-4" />
          </Button>
        </div>
      </Card>

      {/* Recent trips */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">Recent activity</h2>
          {(trips.data?.length ?? 0) > 5 && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/trips")}>
              View all
            </Button>
          )}
        </div>
        <AsyncBoundary
          state={trips.state}
          onRetry={trips.refetch}
          label="Your trips and bookings"
          empty={
            <EmptyState
              icon={<Route className="size-6 text-muted-fg" />}
              title="No trips yet"
              description="Your rides, bookings and deliveries will show up here once you take your first one."
              action={
                <Button variant="accent" onClick={() => navigate("/app/book/taxi")}>
                  Book a ride
                </Button>
              }
            />
          }
        >
          <div className="space-y-2">
            {(trips.data ?? []).slice(0, 5).map((t) => {
              const ServiceIcon = SERVICE_ICON[t.service];
              return (
                <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-fg">
                      <ServiceIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {t.from} → {t.to}
                      </p>
                      <p className="text-xs text-muted-fg">{new Date(t.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_VARIANT[t.status]} className="capitalize">
                      {t.status.toLowerCase()}
                    </Badge>
                    <span className="text-sm font-semibold">{npr(t.fare)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </AsyncBoundary>
      </section>

      {/* By category */}
      <section>
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">Browse by category</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_GROUPS.map((g) => {
            const count = SERVICES.filter((s) => s.group === g).length;
            return (
              <Card key={g} className="p-5">
                <p className="font-display font-semibold">{g}</p>
                <p className="mt-1 text-sm text-muted-fg">{count} services</p>
                <div className="mt-3 flex -space-x-1.5">
                  {SERVICES.filter((s) => s.group === g).map((s) => (
                    <span
                      key={s.id}
                      className="grid size-7 place-items-center rounded-lg border border-border bg-surface text-muted-fg"
                    >
                      <Icon name={s.icon} className="size-3.5" />
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}