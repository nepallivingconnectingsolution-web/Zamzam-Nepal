import { useNavigate } from "react-router-dom";
import { BellRing, Navigation, Power, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { npr } from "@/lib/utils";
import { useDriverPortal } from "./driver-portal.context";

/**
 * Driver landing page. One overview that pulls together everything the
 * portal provider already tracks — online status + GPS broadcast, today's
 * earnings and rating, the active trip (if any), and live incoming
 * requests — so a driver sees their whole shift at a glance instead of
 * hopping between the Earnings, Ride requests and Current trip pages.
 *
 * It fetches nothing of its own: every value comes from useDriverPortal(),
 * the context mounted once at the /driver route root, so this page shares
 * the exact same online-toggle and polling the other driver pages use and
 * can never drift out of sync with them.
 */
export function DriverDashboard() {
  const navigate = useNavigate();
  const {
    online,
    toggling,
    broadcasting,
    toggleOnline,
    earnings,
    requests,
    rating,
    job,
    actionBusy,
    acceptRequest,
  advanceJob,
  } = useDriverPortal();

  const ratingValue =
    rating.state === "success" && rating.data ? rating.data.average.toFixed(1) : undefined;
  const ratingCaption =
    rating.data && rating.data.count > 0
      ? `${rating.data.count} review${rating.data.count === 1 ? "" : "s"}`
      : "No reviews yet";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Your shift at a glance — status, earnings and live requests."
        actions={
          <Button variant={online ? "danger" : "accent"} onClick={toggleOnline} disabled={toggling}>
            <Power className="size-4" />
            {online ? "Go offline" : "Go online"}
          </Button>
        }
      />

      {/* Online / broadcasting status */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className={
              "grid size-9 place-items-center rounded-lg " +
              (online ? "bg-success/10 text-success" : "bg-surface-2 text-muted-fg")
            }
          >
            <Power className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold">{online ? "You're online" : "You're offline"}</p>
            <p className="text-xs text-muted-fg">
              {online
                ? broadcasting
                  ? "Broadcasting your location — riders nearby can match with you."
                  : "Waiting for a location signal…"
                : "Go online to start matching with riders."}
            </p>
          </div>
        </div>
        {online && (
          <Badge variant={broadcasting ? "success" : "warning"}>
            <Wifi className="size-3.5" />
            {broadcasting ? "Live" : "Locating…"}
          </Badge>
        )}
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Today's earnings"
          icon="Banknote"
          state={earnings.state}
          value={npr(earnings.data?.today ?? 0)}
          caption="today so far"
        />
        <StatCard
          label="Trips today"
          icon="Route"
          state={earnings.state}
          value={earnings.data?.tripsToday ?? 0}
          caption="completed"
        />
        <StatCard
          label="This week"
          icon="TrendingUp"
          state={earnings.state}
          value={npr(earnings.data?.week ?? 0)}
          caption="rolling 7 days"
        />
        <StatCard
          label="Rating"
          icon="Star"
          state={rating.state}
          value={ratingValue}
          caption={ratingCaption}
        />
      </div>

      {/* An active trip takes priority; otherwise show incoming requests */}
      {job.data ? (
        <Card className="space-y-4 border-accent/40 bg-accent/5 p-5">
          <div className="flex items-center justify-between">
            <Badge variant={job.data.status === "PAYMENT_PENDING" ? "warning" : "success"} className="capitalize">
              {job.data.status === "ACCEPTED"
                ? "Head to pickup"
                : job.data.status === "PAYMENT_PENDING"
                  ? "Collect payment"
                  : "Trip in progress"}
            </Badge>
            <Badge variant="accent">{npr(job.data.fare)}</Badge>
          </div>
          <div>
            <p className="text-base font-semibold capitalize">{job.data.service}</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent" /> {job.data.from}
              </p>
              <p className="flex items-center gap-2 text-muted-fg">
                <span className="size-2 rounded-full bg-muted-fg" /> {job.data.to}
              </p>
            </div>
          </div>
         <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              disabled={actionBusy === job.data.id}
              onClick={() =>
                job.data!.status === "PAYMENT_PENDING" ? navigate("/driver/trip") : advanceJob(job.data!)
              }
            >
              {job.data.status === "ACCEPTED"
                ? "Start trip"
                : job.data.status === "PAYMENT_PENDING"
                  ? "Collect payment"
                  : "End trip"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/driver/trip")}>
              <Navigation className="size-4" /> Open trip
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <p className="text-sm font-semibold">Incoming requests</p>
              <p className="text-xs text-muted-fg">
                Nearby trips within 10 km, refreshed every few seconds.
              </p>
            </div>
            {online && (requests.data?.length ?? 0) > 0 && (
              <Button size="sm" variant="ghost" onClick={() => navigate("/driver/requests")}>
                View all
              </Button>
            )}
          </div>
          <div className="p-4">
            <AsyncBoundary
              state={online ? requests.state : "empty"}
              onRetry={requests.refetch}
              label="Ride requests"
              empty={
                <EmptyState
                  icon={<BellRing className="size-6 text-muted-fg" />}
                  title={online ? "Waiting for requests" : "Go online to receive requests"}
                  description={
                    online
                      ? "Matched ride requests will appear here in real time."
                      : "Flip the switch above to start matching with riders."
                  }
                  action={
                    !online ? (
                      <Button variant="accent" onClick={toggleOnline} disabled={toggling}>
                        <Power className="size-4" /> Go online
                      </Button>
                    ) : undefined
                  }
                />
              }
            >
              <div className="space-y-3">
                {(requests.data ?? []).slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize">
                        {r.service} · {r.from} → {r.to}
                      </p>
                      <p className="text-xs text-muted-fg">
                        {r.pickupKm != null
                          ? `Pickup ${r.pickupKm} km away · ~${r.etaMin} min`
                          : "Pickup distance unavailable"}
                        {r.parcelWeightKg != null ? ` · ${r.parcelWeightKg} kg parcel` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="success">{npr(r.fare)}</Badge>
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={actionBusy === r.id}
                        onClick={() => acceptRequest(r.id)}
                      >
                        Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncBoundary>
          </div>
        </Card>
      )}
    </div>
  );
}