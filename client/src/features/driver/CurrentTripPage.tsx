import { useNavigate } from "react-router-dom";
import { Banknote, CheckCircle2, Navigation, Phone, User, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { LiveMap, type LiveMapMarker } from "@/components/shared/live-map";
import { npr } from "@/lib/utils";
import { useDriverPortal, type CompletedTrip, type CurrentJob } from "./driver-portal.context";

/**
 * The driver's trip screen is a three-stage flow (the Uber/Pathao closure
 * model), keyed off the job's status:
 *
 *   ACCEPTED / ONGOING  → trip controls (Start trip / End trip)
 *   PAYMENT_PENDING     → fare collection ("Collect Rs X" / wallet auto-settle)
 *   settled (lastTrip)  → earnings recap + "Find next ride"
 *
 * Ending a trip never dumps the driver back on the dashboard anymore — each
 * stage hands off to the next until the loop closes back to finding rides.
 */
export function CurrentTripPage() {
  const navigate = useNavigate();
  const { job, actionBusy, advanceJob, settleCash, lastTrip, clearLastTrip, earnings, myLocation } = useDriverPortal();

  // Stage 3: the fare just settled (cash confirmed, or wallet detected) —
  // show the recap even though /rides/current is null now.
 if (lastTrip && (!job.data || job.data.id === lastTrip.id)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trip complete" subtitle="Fare settled — here's how it went." />
        <TripRecap
          trip={lastTrip}
          todayTotal={earnings.data?.today ?? null}
          onNext={() => {
            clearLastTrip();
            navigate("/driver/requests");
          }}
          onDashboard={() => {
            clearLastTrip();
            navigate("/driver");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Current trip" subtitle="Navigation and trip controls for your active job." />

      <AsyncBoundary
        state={job.state}
        onRetry={job.refetch}
        label="Your current trip"
        empty={
          <EmptyState
            icon={<Navigation className="size-6 text-muted-fg" />}
            title="No active trip"
            description="Accept a request from Ride requests and it will show up here with live trip controls."
            action={
              <Button variant="accent" onClick={() => navigate("/driver/requests")}>
                View ride requests
              </Button>
            }
          />
        }
      >
        {job.data &&
          (job.data.status === "PAYMENT_PENDING" ? (
            <CollectFare job={job.data} busy={actionBusy === job.data.id} onCashCollected={() => settleCash(job.data!)} />
          ) : (
            <div className="space-y-4">
              <TripMap job={job.data} myLocation={myLocation} />
              <Card className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <Badge variant="success" className="capitalize">
                  {job.data.status === "ACCEPTED" ? "Head to pickup" : "Trip in progress"}
                </Badge>
                <Badge variant="accent">{npr(job.data.fare)}</Badge>
              </div>

              <div>
                <p className="text-lg font-semibold capitalize">{job.data.service}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-accent" /> {job.data.from}
                  </p>
                  <p className="flex items-center gap-2 text-muted-fg">
                    <span className="size-2 rounded-full bg-muted-fg" /> {job.data.to}
                  </p>
                </div>
              </div>

              {(job.data.customerName || job.data.customerMobile) && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  {job.data.customerName && (
                    <span className="flex items-center gap-1.5">
                      <User className="size-4 text-muted-fg" /> {job.data.customerName}
                    </span>
                  )}
                  {job.data.customerMobile && (
                    <a href={`tel:${job.data.customerMobile}`} className="flex items-center gap-1.5 text-accent">
                      <Phone className="size-4" /> {job.data.customerMobile}
                    </a>
                  )}
                </div>
              )}

              <Button
                className="w-full"
                variant="accent"
                size="lg"
                disabled={actionBusy === job.data.id}
                onClick={() => advanceJob(job.data!)}
              >
               {job.data.status === "ACCEPTED" ? "Start trip" : "End trip"}
              </Button>
              </Card>
            </div>
          ))}
      </AsyncBoundary>
    </div>
  );
}

/** Live map — pickup/drop pins plus the driver's own live position, with a route line to whichever stop is next. */
function TripMap({ job, myLocation }: { job: CurrentJob; myLocation: { lat: number; lng: number } | null }) {
  const markers: LiveMapMarker[] = [
    ...(job.pickupLat != null && job.pickupLng != null
      ? [{ id: "pickup", lat: job.pickupLat, lng: job.pickupLng, variant: "pickup" as const, label: job.from }]
      : []),
    ...(job.dropLat != null && job.dropLng != null
      ? [{ id: "drop", lat: job.dropLat, lng: job.dropLng, variant: "drop" as const, label: job.to }]
      : []),
    ...(myLocation ? [{ id: "you", lat: myLocation.lat, lng: myLocation.lng, variant: "you" as const, label: "You" }] : []),
  ];

  // While heading to the customer, the next stop is pickup; once the trip
  // has started, it's the drop-off — the route line always points at
  // whichever one is actually still ahead.
  const nextStopLat = job.status === "ACCEPTED" ? job.pickupLat : job.dropLat;
  const nextStopLng = job.status === "ACCEPTED" ? job.pickupLng : job.dropLng;
  const route: [number, number][] | undefined =
    myLocation && nextStopLat != null && nextStopLng != null
      ? [
          [myLocation.lat, myLocation.lng],
          [nextStopLat, nextStopLng],
        ]
      : undefined;

  if (markers.length === 0) return null;

  return (
    <Card className="relative h-64 overflow-hidden sm:h-72">
      <LiveMap markers={markers} route={route} className="absolute inset-0" />
    </Card>
  );
}

/** Stage 2 — the trip has ended; the fare hasn't settled yet. */
function CollectFare({ job, busy, onCashCollected }: { job: CurrentJob; busy: boolean; onCashCollected: () => void }) {
  return (
    <Card className="space-y-5 border-accent/40 bg-accent/5 p-6">
      <div className="flex items-center justify-between">
        <Badge variant="warning">Collect payment</Badge>
        <Badge variant="outline" className="capitalize">
          {job.service}
        </Badge>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-fg">Fare to collect{job.customerName ? ` from ${job.customerName}` : ""}</p>
        <p className="font-display text-4xl font-bold">{npr(job.fare)}</p>
        <p className="mt-1 text-xs text-muted-fg">
          {job.from} → {job.to}
        </p>
      </div>

      <Button className="w-full" variant="accent" size="lg" disabled={busy} onClick={onCashCollected}>
        <Banknote className="size-5" /> Cash collected — {npr(job.fare)}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-fg">
        <Wallet className="size-3.5" />
        If the customer pays from their Zamzam wallet, this completes automatically.
      </p>
    </Card>
  );
}

/** Stage 3 — settled. Close the loop back to finding the next ride. */
function TripRecap({
  trip,
  todayTotal,
  onNext,
  onDashboard,
}: {
  trip: CompletedTrip;
  todayTotal: number | null;
  onNext: () => void;
  onDashboard: () => void;
}) {
  return (
    <Card className="space-y-5 p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="grid size-12 place-items-center rounded-full bg-success/15">
          <CheckCircle2 className="size-6 text-success" />
        </span>
        <p className="text-sm text-muted-fg">You earned</p>
        <p className="font-display text-4xl font-bold">{npr(trip.fare)}</p>
        <Badge variant="outline">{trip.method === "cash" ? "Paid in cash" : "Paid from wallet"}</Badge>
      </div>

      <p className="text-xs text-muted-fg">
        {trip.from} → {trip.to}
      </p>

      {todayTotal != null && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <span className="text-muted-fg">Today's earnings</span>{" "}
          <span className="font-display font-semibold">{npr(todayTotal)}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="accent" size="lg" onClick={onNext}>
          Find next ride
        </Button>
        <Button variant="ghost" onClick={onDashboard}>
          Back to dashboard
        </Button>
      </div>
    </Card>
  );
}