import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation,
  Package,
 Phone,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";
import { SERVICES } from "@/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { LiveMap, type LiveMapMarker } from "@/components/shared/live-map";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { npr } from "@/lib/utils";
import { RateTripPrompt } from "./RateTripPrompt";

/* ── Booking-capable services on this page ─────────────────────────────── */
const BOOKABLE = ["taxi", "bike", "parcel"] as const;
type BookableService = (typeof BOOKABLE)[number];

/**
 * Preset pickup/drop-off points — the honest MVP stand-in for address
 * autocomplete until a Mapbox/Google Places key is provisioned (section 4.1
 * of the architecture doc). Coordinates are the real places.
 */
const SPOTS: { label: string; lat: number; lng: number }[] = [
  { label: "Thamel", lat: 27.7154, lng: 85.3123 },
  { label: "New Road", lat: 27.7041, lng: 85.3131 },
  { label: "Tribhuvan Airport", lat: 27.6981, lng: 85.3592 },
  { label: "Patan Durbar Square", lat: 27.6734, lng: 85.3261 },
  { label: "Bhaktapur Durbar Square", lat: 27.6722, lng: 85.4281 },
  { label: "New Baneshwor", lat: 27.6893, lng: 85.3350 },
  { label: "Koteshwor", lat: 27.6789, lng: 85.3494 },
  { label: "Kalanki", lat: 27.6933, lng: 85.2814 },
  { label: "Balaju", lat: 27.7357, lng: 85.3050 },
  { label: "Budhanilkantha", lat: 27.7784, lng: 85.3627 },
  { label: "Kirtipur", lat: 27.6789, lng: 85.2774 },
  { label: "Swayambhunath", lat: 27.7149, lng: 85.2904 },
];

/** Client-side preview of the server's fare model (server is authoritative). */
const FARES: Record<BookableService, { base: number; perKm: number; min: number }> = {
  taxi: { base: 100, perKm: 45, min: 150 },
  bike: { base: 50, perKm: 25, min: 80 },
  parcel: { base: 80, perKm: 30, min: 100 },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NearbyDriver {
  driverId: string;
  driverName: string;
  category: string;
  makeModel: string;
  plateNumber: string;
  lat: number;
  lng: number;
  distanceKm: number;
  etaMin: number;
}

interface ActiveRide {
  id: string;
  service: string;
  from: string;
  to: string;
  fare: number;
  status: "REQUESTED" | "ACCEPTED" | "ONGOING" | "PAYMENT_PENDING" | "COMPLETED" | "CANCELLED";
  driverName: string | null;
  driverMobile: string | null;
  vehicleMakeModel: string | null;
  vehiclePlate: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  /** The assigned driver's live position — null until they've broadcast at least once. */
  driverLat: number | null;
  driverLng: number | null;
}

/**
 * Snapshot of the trip that just settled — /rides/active returns null the
 * moment a ride completes, so the receipt + rating card need their own copy.
 */
interface FinishedTrip {
  id: string;
  fare: number;
  from: string;
  to: string;
  driverName: string | null;
  method: "cash" | "wallet";
}

/**
 * Snapshot of a booking the customer just cancelled — same reasoning as
 * FinishedTrip: /rides/active goes null the instant the cancel call
 * succeeds, so the confirmation card needs its own copy of what was cancelled.
 */
interface CancelledTrip {
  id: string;
  fare: number;
  from: string;
  to: string;
  driverName: string | null;
}

type PickupChoice = { kind: "spot"; index: number } | { kind: "gps"; lat: number; lng: number };

export function ServiceBookingPage() {
 const { service } = useParams<{ service: string }>();
const navigate = useNavigate();
const svc = SERVICES.find((s) => s.id === service);
  const bookable = BOOKABLE.includes(service as BookableService);

  /* ── Booking form state ── */
  const [pickup, setPickup] = useState<PickupChoice>({ kind: "spot", index: 0 });
  const [dropIndex, setDropIndex] = useState(2); // Airport by default
  const [weightKg, setWeightKg] = useState("5");
  const [locating, setLocating] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelledId, setCancelledId] = useState<string | null>(null);
  const [cancelledTrip, setCancelledTrip] = useState<CancelledTrip | null>(null);

  const pickupCoords =
    pickup.kind === "gps" ? { lat: pickup.lat, lng: pickup.lng } : { lat: SPOTS[pickup.index].lat, lng: SPOTS[pickup.index].lng };
  const pickupLabel = pickup.kind === "gps" ? "My current location" : SPOTS[pickup.index].label;
  const drop = SPOTS[dropIndex];
  const parcelWeight = Math.max(1, Number(weightKg) || 5);

  /* ── The customer's live booking, polled so status changes appear alone ── */
  const activeRide = useResource<ActiveRide | null>(() => api.get(endpoints.rides.active), [], {
    refreshInterval: 4000,
  });
  const ride = activeRide.data ?? null;

  // ── Trip closure ─────────────────────────────────────────────────────────
  // A ride now finishes in two steps: the driver ends it (PAYMENT_PENDING —
  // still returned by /rides/active, so the panel below switches to the pay
  // step) and then the fare settles (COMPLETED — active goes null). When it
  // goes null, snapshot the previous poll's ride into finishedTrip so the
  // receipt + rating card have data. settledIdRef guarantees exactly one
  // snapshot per trip: payWallet() claims it first when the customer paid
  // in-app; otherwise this effect claims it and infers cash (the only other
  // way a fare settles).
  const prevRideRef = useRef<ActiveRide | null>(null);
  const settledIdRef = useRef<string | null>(null);
  const [finishedTrip, setFinishedTrip] = useState<FinishedTrip | null>(null);
  useEffect(() => {
    if (activeRide.state === "idle" || activeRide.state === "loading") return;
    const prev = prevRideRef.current;
    if (
      !ride &&
      prev &&
      (prev.status === "ONGOING" || prev.status === "PAYMENT_PENDING") &&
      settledIdRef.current !== prev.id
    ) {
      settledIdRef.current = prev.id;
      setFinishedTrip({ id: prev.id, fare: prev.fare, from: prev.from, to: prev.to, driverName: prev.driverName, method: "cash" });
      toast.success("Trip completed", "Thanks for riding with Zamzam!");
    }
    prevRideRef.current = ride;
  }, [ride, activeRide.state]);

  // Wallet balance, fetched only while a fare is waiting to be settled —
  // it powers the "Pay from wallet" button and its insufficient-balance state.
  const needsPayment = ride?.status === "PAYMENT_PENDING";
  const wallet = useResource<{ available: number }>(
    () => (needsPayment ? api.get(endpoints.wallet.balance) : Promise.resolve({ available: 0 })),
    [needsPayment],
  );

  const [payBusy, setPayBusy] = useState(false);
  async function payWallet() {
    if (!ride) return;
    setPayBusy(true);
    try {
      await api.post(endpoints.rides.pay(ride.id), { method: "wallet" });
      // Claim the snapshot before the next poll clears the active ride, so
      // the closure effect above doesn't overwrite the method with "cash".
      settledIdRef.current = ride.id;
      setFinishedTrip({ id: ride.id, fare: ride.fare, from: ride.from, to: ride.to, driverName: ride.driverName, method: "wallet" });
      toast.success("Payment complete", `${npr(ride.fare)} paid from your Zamzam wallet.`);
      activeRide.refetch();
    } catch (err) {
      // A 402 lands here with the server's "insufficient balance" message;
      // ALREADY_SETTLED means the driver confirmed cash a moment earlier —
      // the refetch lets the closure effect finish the trip as cash.
      toast.error(err instanceof ApiError ? err.message : "Couldn't complete the payment.");
      activeRide.refetch();
    } finally {
      setPayBusy(false);
    }
  }

  /* ── Live nearby vehicles for the chosen pickup point ── */
  const nearbyPath = bookable
    ? `${endpoints.drivers.nearby}?service=${service}&lat=${pickupCoords.lat}&lng=${pickupCoords.lng}${
        service === "parcel" ? `&weightKg=${parcelWeight}` : ""
      }`
    : null;
  const nearby = useResource<NearbyDriver[]>(
    () => (nearbyPath ? api.get(nearbyPath) : Promise.resolve([])),
    [nearbyPath],
    { refreshInterval: 10_000 },
  );

  if (!svc) {
    return <EmptyState title="Service not found" description="This service isn't available yet." />;
  }

  /* ── Non-bookable services keep a clear signpost ── */
  if (!bookable) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={svc.name}
          subtitle={svc.tagline}
          actions={<Badge variant="outline">Coming soon</Badge>}
        />
        <EmptyState
          title={`${svc.name} booking is coming soon`}
          description={
            service === "bus"
              ? "Intercity bus seats are booked from the Buses page in the sidebar."
              : "This service's booking flow is being built — check back shortly."
          }
        />
      </div>
    );
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("This browser has no location support.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickup({ kind: "gps", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error("Location permission denied.", "Pick a pickup point from the list instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  const distanceKm = haversineKm(pickupCoords.lat, pickupCoords.lng, drop.lat, drop.lng);
  const f = FARES[service as BookableService];
  const fareEstimate = Math.max(f.min, Math.round(f.base + f.perKm * distanceKm));

  async function book() {
    setBookingBusy(true);
    try {
      await api.post(endpoints.rides.request, {
        service,
        fromLabel: pickupLabel,
        toLabel: drop.label,
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        dropLat: drop.lat,
        dropLng: drop.lng,
        ...(service === "parcel" ? { parcelWeightKg: parcelWeight } : {}),
      });
      setCancelledTrip(null);
      toast.success("Request sent", "We're matching you with a nearby driver.");
      activeRide.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the booking. Try again.");
    } finally {
      setBookingBusy(false);
    }
  }

 async function cancelRide() {
    if (!ride) return;
    setCancelBusy(true);
    try {
      await api.post(endpoints.rides.cancel(ride.id));
      toast.success("Booking cancelled", "Request a new ride whenever you're ready.");
      // Don't wait on the next /rides/active poll to flip `ride` to null —
      // that's the race that left the old panel stuck on screen with a
      // live Cancel button after the backend had already cancelled it.
      // Hiding this specific ride id locally makes the booking form
      // reappear immediately; the refetch just keeps this page's own
      // state in sync with the server underneath.
      setCancelledId(ride.id);
      activeRide.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this booking.");
    } finally {
      setCancelBusy(false);
    }
  }

 const selectClass =
    "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";

  // Same condition the panel below switches on — kept in one place so the
  // map and the panel never disagree about which state they're showing.
  const showActivePanel = Boolean(ride && finishedTrip?.id !== ride.id && cancelledId !== ride.id);

  /**
   * Before a booking: pickup + drop-off pins, plus every nearby driver so
   * the customer can see who's around. Once a ride is active: just the
   * pickup/drop pins and the assigned driver's live position (their dot
   * glides across the map as their broadcast updates every ~15s).
   */
  const mapMarkers: LiveMapMarker[] = showActivePanel && ride
    ? [
        ...(ride.pickupLat != null && ride.pickupLng != null
          ? [{ id: "pickup", lat: ride.pickupLat, lng: ride.pickupLng, variant: "pickup" as const, label: ride.from }]
          : []),
        ...(ride.dropLat != null && ride.dropLng != null
          ? [{ id: "drop", lat: ride.dropLat, lng: ride.dropLng, variant: "drop" as const, label: ride.to }]
          : []),
        ...(ride.driverLat != null && ride.driverLng != null
          ? [
              {
                id: "driver",
                lat: ride.driverLat,
                lng: ride.driverLng,
                variant: "driver" as const,
                label: ride.driverName ?? "Your driver",
              },
            ]
          : []),
      ]
    : [
        { id: "pickup", lat: pickupCoords.lat, lng: pickupCoords.lng, variant: "pickup", label: pickupLabel },
        { id: "drop", lat: drop.lat, lng: drop.lng, variant: "drop", label: drop.label },
        ...(nearby.data ?? []).map((d) => ({
          id: `nearby-${d.driverId}`,
          lat: d.lat,
          lng: d.lng,
          variant: "nearby" as const,
          label: `${d.makeModel} · ${d.distanceKm} km away`,
        })),
      ];

  const mapRoute: [number, number][] | undefined =
    showActivePanel && ride && ride.pickupLat != null && ride.pickupLng != null && ride.dropLat != null && ride.dropLng != null
      ? [
          [ride.pickupLat, ride.pickupLng],
          [ride.dropLat, ride.dropLng],
        ]
      : !showActivePanel
        ? [
            [pickupCoords.lat, pickupCoords.lng],
            [drop.lat, drop.lng],
          ]
        : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={svc.name}
        subtitle={svc.tagline}
        actions={<Badge variant="success">Live</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Live map — pickup/drop pins, nearby drivers, and (once matched) the assigned driver's live position. */}
        <Card className="relative min-h-[420px] overflow-hidden">
          <LiveMap markers={mapMarkers} route={mapRoute} className="absolute inset-0" />
        </Card>

        <div className="space-y-4">
          {showActivePanel && ride ? (
            /* ── Active booking panel ─────────────────────────────────── */
            <Card className="space-y-4 p-5">
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
                  {ride.status === "PAYMENT_PENDING" && "Trip ended — settle your fare"}
                </h3>
                <Badge
                  variant={
                    ride.status === "REQUESTED" ? "warning" : ride.status === "PAYMENT_PENDING" ? "warning" : "success"
                  }
                  className="ml-auto capitalize"
                >
                  {ride.status === "PAYMENT_PENDING" ? "payment due" : ride.status.toLowerCase()}
                </Badge>
              </div>

              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2">
                  <Circle className="size-3 fill-accent text-accent" /> {ride.from}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 text-danger" /> {ride.to}
                </p>
              </div>

              {ride.driverName && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{ride.driverName}</p>
                  <p className="text-xs text-muted-fg">
                    {ride.vehicleMakeModel} · <span className="uppercase">{ride.vehiclePlate}</span>
                  </p>
                  {ride.driverMobile && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-fg">
                      <Phone className="size-3" /> {ride.driverMobile}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-fg">Fare</span>
                <span className="font-display font-semibold">{npr(ride.fare)}</span>
              </div>

              {(ride.status === "REQUESTED" || ride.status === "ACCEPTED") && (
                <Button variant="outline" className="w-full" disabled={cancelBusy} onClick={cancelRide}>
                  <XCircle className="size-4" /> Cancel booking
                </Button>
              )}
              {ride.status === "ONGOING" && (
                <p className="text-center text-xs text-muted-fg">
                  You'll settle {npr(ride.fare)} at drop-off — cash or Zamzam wallet.
                </p>
              )}
              {ride.status === "PAYMENT_PENDING" && (
                <div className="space-y-3">
                  <Button className="w-full" variant="accent" size="lg" disabled={payBusy} onClick={payWallet}>
                    <Wallet className="size-5" /> Pay {npr(ride.fare)} from wallet
                  </Button>
                  <p className="text-center text-xs text-muted-fg">
                    {wallet.data
                      ? wallet.data.available >= ride.fare
                        ? `Wallet balance: ${npr(wallet.data.available)}`
                        : `Wallet balance ${npr(wallet.data.available)} — not enough for this fare.`
                      : "Checking your wallet balance…"}
                  </p>
                  <p className="border-t border-border pt-3 text-center text-xs text-muted-fg">
                    Or hand the driver {npr(ride.fare)} in cash — they'll confirm it and this wraps up automatically.
                  </p>
                </div>
              )}
            </Card>
          ) : (
            /* ── Booking form ─────────────────────────────────────────── */
            <div className="space-y-4">
              {cancelledTrip && (
                <Card className="space-y-4 border-danger/40 bg-danger/5 p-5">
                  <div className="flex items-center gap-2">
                    <XCircle className="size-4 text-danger" />
                    <h3 className="text-sm font-semibold">Booking cancelled</h3>
                    <Badge variant="danger" className="ml-auto">
                      Cancelled
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {cancelledTrip.from} → {cancelledTrip.to}
                      </p>
                      <p className="text-xs text-muted-fg">
                        {cancelledTrip.driverName
                          ? `You were matched with ${cancelledTrip.driverName} — they've been notified.`
                          : "No driver had been assigned yet."}
                      </p>
                    </div>
                    <p className="font-display text-lg font-bold text-muted-fg line-through">{npr(cancelledTrip.fare)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="accent" className="flex-1" onClick={() => setCancelledTrip(null)}>
                      Book another ride
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => navigate("/app/trips")}>
                      View my trips
                    </Button>
                  </div>
                </Card>
              )}
             {finishedTrip && (
                <Card className="space-y-4 border-accent/40 bg-accent/5 p-5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" />
                    <h3 className="text-sm font-semibold">Trip completed</h3>
                    <Badge variant="outline" className="ml-auto">
                      {finishedTrip.method === "wallet" ? "Paid from wallet" : "Paid in cash"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {finishedTrip.from} → {finishedTrip.to}
                      </p>
                      {finishedTrip.driverName && (
                        <p className="text-xs text-muted-fg">Driver · {finishedTrip.driverName}</p>
                      )}
                    </div>
                    <p className="font-display text-lg font-bold">{npr(finishedTrip.fare)}</p>
                  </div>
                  <RateTripPrompt
                    rideId={finishedTrip.id}
                    onDone={() => {
                      setFinishedTrip(null);
                      // Trip's fully wrapped up (rated or skipped) — head back
                      // to the marketplace overview instead of leaving the
                      // customer sitting on an empty booking form.
                      navigate("/app");
                    }}
                  />
                </Card>
              )}
              <Card className="p-5">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-fg">Pickup</label>
                    <div className="flex gap-2">
                      <select
                        className={selectClass}
                        value={pickup.kind === "gps" ? "gps" : String(pickup.index)}
                        onChange={(e) => {
                          if (e.target.value !== "gps") setPickup({ kind: "spot", index: Number(e.target.value) });
                        }}
                      >
                        {pickup.kind === "gps" && <option value="gps">My current location</option>}
                        {SPOTS.map((s, i) => (
                          <option key={s.label} value={i}>{s.label}</option>
                        ))}
                      </select>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={useMyLocation} disabled={locating} title="Use my current location">
                        <LocateFixed className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-fg">Drop-off</label>
                    <select className={selectClass} value={dropIndex} onChange={(e) => setDropIndex(Number(e.target.value))}>
                      {SPOTS.map((s, i) => (
                        <option key={s.label} value={i}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {service === "parcel" && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-fg">
                        <Package className="size-3.5" /> Package weight (kg)
                      </label>
                      <Input type="number" min={1} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                    </div>
                  )}

                  <Button variant="accent" className="w-full" onClick={book} disabled={bookingBusy}>
                    <Search className="size-4" /> {bookingBusy ? "Booking…" : `Find ${svc.name.toLowerCase()}`}
                  </Button>
                </div>

                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-fg">Estimated fare · {distanceKm.toFixed(1)} km</span>
                    <span className="font-display font-semibold">{npr(fareEstimate)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-fg">
                    Straight-line estimate — the final fare is fixed when you book.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {/* ── Live nearby vehicles ─────────────────────────────────── */}
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Navigation className="size-4 text-accent" /> Nearby drivers
              <span className="ml-auto text-xs font-normal text-muted-fg">near {pickupLabel}</span>
            </h3>
            <AsyncBoundary
              state={nearby.state}
              onRetry={nearby.refetch}
              label="Nearby drivers"
              empty={
                <p className="py-6 text-center text-sm text-muted-fg">
                  No drivers online nearby right now. We'll match you the moment one is.
                </p>
              }
            >
              <div className="space-y-2">
                {(nearby.data ?? []).map((d) => (
                  <div key={d.driverId} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.makeModel}</p>
                      <p className="text-xs text-muted-fg">
                        <span className="uppercase">{d.plateNumber}</span> · {d.distanceKm} km away
                      </p>
                    </div>
                    <Badge variant="accent">~{d.etaMin} min</Badge>
                  </div>
                ))}
              </div>
            </AsyncBoundary>
          </Card>
        </div>
      </div>
    </div>
  );
}