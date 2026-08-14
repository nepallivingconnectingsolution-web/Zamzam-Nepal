import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  Circle,
  Gauge,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  Search,
  Share2,
  ShieldAlert,
  Star,
  Wallet,
  XCircle,
} from "lucide-react";
import { SERVICES } from "@/config";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { LiveMap, type LiveMapMarker } from "@/components/shared/live-map";
import { RideChatPanel } from "@/components/shared/ride-chat-panel";
import { TripStatusStepper } from "@/components/shared/trip-status-stepper";
import { CancelReasonPrompt } from "@/components/shared/cancel-reason-prompt";
import { useResource } from "@/hooks/useResource";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { cn, npr } from "@/lib/utils";
import { RateTripPrompt } from "./RateTripPrompt";

/* ── Booking-capable services on this page ─────────────────────────────── */
const BOOKABLE = ["taxi", "bike", "parcel"] as const;
type BookableService = (typeof BOOKABLE)[number];

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

const POPULAR_PLACES: Place[] = [
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

/** "Jun 2026" style tenure label for the driver trust card. */
function memberSinceLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Mirrors the server's common/geo.ts rough-ETA formula (~20 km/h average). */
function etaMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 20) * 60));
}

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
  /** Trust signals shown on the driver card once matched — Uber's "who's picking me up". */
  driverAvatarUrl: string | null;
  driverRating: number | null;
  driverRatingCount: number | null;
  driverTripsCompleted: number | null;
  driverMemberSince: string | null;
  /** Live distance/ETA from the driver's GPS to whichever stop is next (pickup, then drop-off). */
  driverDistanceKm: number | null;
  driverEtaMin: number | null;
  /** Messages from the driver not yet opened — powers the Chat button badge. */
  unreadMessages: number;
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

type PickupChoice = { kind: "place"; place: Place } | { kind: "gps"; lat: number; lng: number };

function LocationField({
  label,
  value,
  onPick,
  leadingAction,
}: {
  label: string;
  value: string;
  onPick: (place: Place) => void;
  leadingAction?: { label: ReactNode; icon: typeof LocateFixed; disabled?: boolean; onClick: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, loading, error } = useLocationSearch(query);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  function pick(place: Place) {
    onPick(place);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-fg">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-input bg-surface px-3.5 text-left text-sm text-fg transition-colors active:bg-surface-2"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <MapPin className="size-4 shrink-0 text-muted-fg" /> {value}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-fg" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="space-y-1 pb-2">
          <div className="relative px-0.5 pb-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a place or address in Nepal…"
              className="h-11 w-full rounded-xl border border-input bg-surface pl-10 pr-3.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-accent/40"
            />
          </div>

          {leadingAction && !searching && (
            <button
              type="button"
              disabled={leadingAction.disabled}
              onClick={() => {
                leadingAction.onClick();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-accent-600 transition-colors active:bg-accent/10 disabled:opacity-60 dark:text-accent"
            >
              <leadingAction.icon className="size-4 shrink-0" />
              {leadingAction.label}
            </button>
          )}

          {searching ? (
            loading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-fg">
                <LoaderCircle className="size-3.5 animate-spin" /> Searching…
              </p>
            ) : error ? (
              <p className="py-8 text-center text-xs text-danger">{error}</p>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-fg">No matches for &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick({ label: r.label, lat: r.lat, lng: r.lng })}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-fg transition-colors active:bg-surface-2"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-fg" />
                  <span className="min-w-0">
                    <span className="block truncate">{r.label}</span>
                    {r.secondary && (
                      <span className="block truncate text-xs font-normal text-muted-fg">{r.secondary}</span>
                    )}
                  </span>
                </button>
              ))
            )
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-fg">Popular</p>
              {POPULAR_PLACES.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-fg transition-colors active:bg-surface-2"
                >
                  <MapPin className="size-4 shrink-0 text-muted-fg" /> {p.label}
                </button>
              ))}
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
export function ServiceBookingPage() {
 const { service } = useParams<{ service: string }>();
const navigate = useNavigate();
const svc = SERVICES.find((s) => s.id === service);
  const bookable = BOOKABLE.includes(service as BookableService);

 /* ── Booking form state ── */
  const [pickup, setPickup] = useState<PickupChoice>({ kind: "place", place: POPULAR_PLACES[0] });
  const [drop, setDrop] = useState<Place>(POPULAR_PLACES[2]); // Tribhuvan Airport by default
  const [weightKg, setWeightKg] = useState("5");
  const [locating, setLocating] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelledId, setCancelledId] = useState<string | null>(null);
  const [cancelledTrip, setCancelledTrip] = useState<CancelledTrip | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [cancelPromptOpen, setCancelPromptOpen] = useState(false);

  const pickupCoords =
    pickup.kind === "gps" ? { lat: pickup.lat, lng: pickup.lng } : { lat: pickup.place.lat, lng: pickup.place.lng };
  const pickupLabel = pickup.kind === "gps" ? "My current location" : pickup.place.label;
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

  async function payCash() {
    if (!ride) return;
    setPayBusy(true);
    try {
      await api.post(endpoints.rides.pay(ride.id), { method: "cash" });
      settledIdRef.current = ride.id;
      setFinishedTrip({ id: ride.id, fare: ride.fare, from: ride.from, to: ride.to, driverName: ride.driverName, method: "cash" });
      toast.success("Trip completed", "Thanks for riding with Zamzam!");
      activeRide.refetch();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        settledIdRef.current = ride.id;
        setFinishedTrip({ id: ride.id, fare: ride.fare, from: ride.from, to: ride.to, driverName: ride.driverName, method: "cash" });
        toast.success("Trip completed", "Thanks for riding with Zamzam!");
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't confirm the payment.");
      }
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
        {/* Bus isn't "coming soon" — it's fully built, just on a different
            route. Anyone landing here from an old link/bookmark gets sent to
            it rather than told to look in a sidebar that customers no longer
            have. */}
        {service === "bus" ? (
          <EmptyState
            title="Bus tickets have moved"
            description="Search schedules, pick your seats and pay — all on the Buses page."
            action={
              <Button variant="accent" onClick={() => navigate("/app/buses")}>
                Search buses
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`${svc.name} booking is coming soon`}
            description="This service's booking flow is being built — check back shortly."
          />
        )}
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

  async function shareTrip() {
    if (!ride) return;
    const summary = [
      `I'm on a Zamzam ${service} trip.`,
      `From ${ride.from} to ${ride.to}.`,
      ride.driverName ? `Driver: ${ride.driverName}${ride.vehiclePlate ? ` (${ride.vehiclePlate})` : ""}.` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Zamzam trip", text: summary });
      } catch {
        // User cancelled the share sheet — not an error worth surfacing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Trip details copied", "Paste them to whoever you'd like to share your trip with.");
    } catch {
      toast.error("Couldn't copy trip details.");
    }
  }

 async function cancelRide(reason?: string) {
    if (!ride) return;
    setCancelBusy(true);
    try {
      await api.post(endpoints.rides.cancel(ride.id), { reason });
      toast.success("Booking cancelled", "Request a new ride whenever you're ready.");
      // Don't wait on the next /rides/active poll to flip `ride` to null —
      // that's the race that left the old panel stuck on screen with a
      // live Cancel button after the backend had already cancelled it.
      // Hiding this specific ride id locally makes the booking form
      // reappear immediately; the refetch just keeps this page's own
      // state in sync with the server underneath.
      setCancelledId(ride.id);
      setCancelledTrip({ id: ride.id, fare: ride.fare, from: ride.from, to: ride.to, driverName: ride.driverName });
      setCancelPromptOpen(false);
      activeRide.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this booking.");
    } finally {
      setCancelBusy(false);
    }
  }

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

              <TripStatusStepper status={ride.status} />

              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2">
                  <Circle className="size-3 fill-accent text-accent" /> {ride.from}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 text-danger" /> {ride.to}
                </p>
              </div>

              {ride.driverName && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Avatar name={ride.driverName} src={ride.driverAvatarUrl ?? undefined} className="size-11 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{ride.driverName}</p>
                      <p className="truncate text-xs text-muted-fg">
                        {ride.vehicleMakeModel} · <span className="uppercase">{ride.vehiclePlate}</span>
                      </p>
                    </div>
                    {ride.driverRating != null && ride.driverRatingCount != null && (
                      <div className="shrink-0 text-right">
                        <p className="flex items-center justify-end gap-1 text-sm font-semibold">
                          <Star className="size-3.5 fill-warning text-warning" />
                          {ride.driverRatingCount > 0 ? ride.driverRating.toFixed(1) : "New"}
                        </p>
                        <p className="text-[11px] text-muted-fg">
                          {ride.driverRatingCount > 0 ? `${ride.driverRatingCount} ratings` : "no ratings yet"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Experience — completed trips and how long they've been on Zamzam. */}
                  {(ride.driverTripsCompleted != null || ride.driverMemberSince) && (
                    <p className="border-t border-border pt-2 text-xs text-muted-fg">
                      {ride.driverTripsCompleted != null && (
                        <>
                          {ride.driverTripsCompleted} trip{ride.driverTripsCompleted === 1 ? "" : "s"} completed
                        </>
                      )}
                      {ride.driverTripsCompleted != null && ride.driverMemberSince ? " · " : ""}
                      {ride.driverMemberSince && <>On Zamzam since {memberSinceLabel(ride.driverMemberSince)}</>}
                    </p>
                  )}

                  {/* Live distance/ETA to whichever stop is next — flips to a
                      clear "arrived" callout once the driver is right outside. */}
                  {ride.driverDistanceKm != null && (ride.status === "ACCEPTED" || ride.status === "ONGOING") && (
                    <p
                      className={cn(
                        "flex items-center gap-1.5 border-t border-border pt-2 text-xs font-medium",
                        ride.status === "ACCEPTED" && ride.driverDistanceKm <= 0.15 ? "text-success" : "text-accent",
                      )}
                    >
                      {ride.status === "ACCEPTED" && ride.driverDistanceKm <= 0.15 ? (
                        <>
                          <CheckCircle2 className="size-3.5" /> Your driver has arrived — look for them outside.
                        </>
                      ) : (
                        <>
                          <Gauge className="size-3.5" />
                          {ride.status === "ACCEPTED"
                            ? `Driver is ${ride.driverDistanceKm} km from pickup · ~${ride.driverEtaMin} min`
                            : `${ride.driverDistanceKm} km to drop-off · ~${ride.driverEtaMin} min`}
                        </>
                      )}
                    </p>
                  )}

                  {/* Call + Chat — the two ways to reach a matched driver. */}
                  <div className="flex gap-2 border-t border-border pt-3">
                    {ride.driverMobile && (
                      <a
                        href={`tel:${ride.driverMobile}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
                      >
                        <Phone className="size-3.5" /> Call
                      </a>
                    )}
                    <Button
                      variant={chatOpen ? "accent" : "outline"}
                      size="sm"
                      className="relative flex-1"
                      onClick={() => setChatOpen((v) => !v)}
                    >
                      <MessageCircle className="size-3.5" /> Chat
                      {!chatOpen && ride.unreadMessages > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-semibold text-white">
                          {ride.unreadMessages > 9 ? "9+" : ride.unreadMessages}
                        </span>
                      )}
                    </Button>
                  </div>

                  {/* Safety — share your trip with someone, or reach emergency
                      services directly. Nepal's police line (100) is used
                      here since Zamzam currently only operates in Nepal. */}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1 text-muted-fg" onClick={shareTrip}>
                      <Share2 className="size-3.5" /> Share trip
                    </Button>
                    <a
                      href="tel:100"
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 text-danger")}
                    >
                      <ShieldAlert className="size-3.5" /> Emergency
                    </a>
                  </div>
                </div>
              )}

              {chatOpen && ride.driverName && (
                <RideChatPanel rideId={ride.id} otherPartyName={ride.driverName} onClose={() => setChatOpen(false)} />
              )}

              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-fg">Fare</span>
                <span className="font-display font-semibold font-tabular">{npr(ride.fare)}</span>
              </div>

              {(ride.status === "REQUESTED" || ride.status === "ACCEPTED") &&
                (cancelPromptOpen ? (
                  <CancelReasonPrompt
                    reasons={["Driver is taking too long", "Changed my mind", "Wrong pickup point", "Booked by mistake"]}
                    busy={cancelBusy}
                    onPick={(reason) => cancelRide(reason)}
                    onDismiss={() => setCancelPromptOpen(false)}
                  />
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setCancelPromptOpen(true)}>
                    <XCircle className="size-4" /> Cancel booking
                  </Button>
                ))}
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
                 <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-center text-xs text-muted-fg">Already handed the driver {npr(ride.fare)} in cash?</p>
                    <Button className="w-full" variant="outline" size="lg" disabled={payBusy} onClick={payCash}>
                      <Banknote className="size-5" /> I've paid in cash
                    </Button>
                  </div>
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
                    <p className="font-display text-lg font-bold font-tabular text-muted-fg line-through">{npr(cancelledTrip.fare)}</p>
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
                    <p className="font-display text-lg font-bold font-tabular">{npr(finishedTrip.fare)}</p>
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
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <LocationField
                        label="Pickup"
                        value={pickupLabel}
                        onPick={(place) => setPickup({ kind: "place", place })}
                        leadingAction={{
                          label: locating ? "Locating…" : "Use my current location",
                          icon: LocateFixed,
                          disabled: locating,
                          onClick: useMyLocation,
                        }}
                      />
                    </div>
                  </div>

                  <LocationField label="Drop-off" value={drop.label} onPick={setDrop} />

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
                    <span className="text-muted-fg">Estimated fare · {distanceKm.toFixed(1)} km · ~{etaMinutes(distanceKm)} min</span>
                    <span className="font-display font-semibold font-tabular">{npr(fareEstimate)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-fg">
                    Straight-line estimate — the final fare and time are fixed when you book.
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
