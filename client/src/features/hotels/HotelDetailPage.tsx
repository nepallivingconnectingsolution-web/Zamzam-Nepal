import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BedDouble, CalendarRange,
  CheckCircle2, Clock, CreditCard, MapPin, Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { PhoneField, NameInput, isValidPhone } from "@/components/ui/phone-field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { HotelDetail, RoomAvailability, RoomTypeSummary } from "./types";

const PAYMENT_METHODS = [
  { id: "wallet", label: "Zamzam Wallet" },
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "connectips", label: "ConnectIPS" },
  { id: "imepay", label: "IME Pay" },
  { id: "card", label: "Card" },
  { id: "cash", label: "Pay at hotel" },
];

type Step = "room" | "guest" | "payment" | "done";

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function dayAfterIso() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export function HotelDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const detail = useResource<HotelDetail>(() => api.get(endpoints.hotels.detail(id)), [id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.data?.name ?? "Hotel"}
        subtitle={detail.data ? `${detail.data.address}, ${detail.data.city}` : "Pick your room and dates."}
        actions={
          <Link to="/app/hotels" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft className="size-4" /> All hotels
          </Link>
        }
      />
      <AsyncBoundary state={detail.state} onRetry={detail.refetch} label="Hotel details">
        {detail.data && (
          <BookingFlow hotel={detail.data} onDone={() => navigate("/app/hotels/bookings")} />
        )}
      </AsyncBoundary>
    </div>
  );
}

function BookingFlow({ hotel, onDone }: { hotel: HotelDetail; onDone: () => void }) {
  const [step, setStep] = useState<Step>("room");
  const [roomType, setRoomType] = useState<RoomTypeSummary | null>(hotel.roomTypes[0] ?? null);
  const [checkIn, setCheckIn] = useState(tomorrowIso());
  const [checkOut, setCheckOut] = useState(dayAfterIso());
  const [guests, setGuests] = useState(2);
  const [roomCount, setRoomCount] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [method, setMethod] = useState("esewa");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const availabilityQuery =
    roomType && checkIn && checkOut
      ? `${endpoints.hotels.availability(roomType.id)}?checkIn=${checkIn}&checkOut=${checkOut}`
      : null;

  const availability = useResource<RoomAvailability>(
    () => availabilityQuery ? api.get(availabilityQuery) : Promise.reject(new Error("no room")),
    [availabilityQuery],
  );

  useEffect(() => {
    if (checkOut <= checkIn) {
      const d = new Date(`${checkIn}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      setCheckOut(d.toISOString().slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn]);

  useEffect(() => {
    const max = availability.data?.available ?? 1;
    setRoomCount((c) => Math.min(Math.max(c, 1), Math.max(max, 1)));
  }, [availability.data]);

  async function submit() {
    if (!roomType) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ bookingRef: string }>(endpoints.hotels.book(hotel.id), {
        roomTypeId: roomType.id, checkIn, checkOut, roomCount, guests, guestName, guestPhone, method,
      });
      setRef(res.bookingRef);
      setStep("done");
      toast.success("Booking confirmed", `Reference ${res.bookingRef}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? ((e.detail as { message?: string })?.message ?? "Booking failed.")
          : "Booking failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (hotel.roomTypes.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BedDouble className="mx-auto size-8 text-muted-fg" />
        <p className="mt-3 font-medium">No rooms listed yet</p>
        <p className="mt-1 text-sm text-muted-fg">This hotel hasn't added any room types to book.</p>
      </Card>
    );
  }

  if (step === "done") {
    const total = ((availability.data?.totalPrice ?? 0) * roomCount) + Math.round((availability.data?.totalPrice ?? 0) * roomCount * 0.02);
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </div>
        <h2 className="font-display text-xl font-bold">Booking confirmed!</h2>
        <p className="mt-1 text-sm text-muted-fg">Your room is reserved. Enjoy your stay.</p>
        <div className="mt-6 space-y-2 rounded-xl border border-border bg-surface/60 p-5 text-left text-sm">
          {ref && <Row label="Reference" value={ref} bold />}
          <Row label="Hotel" value={hotel.name} />
          {roomType && <Row label="Room" value={roomType.name} />}
          <Row label="Rooms" value={String(roomCount)} />
          <Row label="Dates" value={`${checkIn} → ${checkOut}`} />
          <Row label="Paid" value={`रू ${total.toLocaleString()}`} bold />
        </div>
        <Button variant="accent" className="mt-6 w-full" onClick={onDone}>View my bookings</Button>
      </Card>
    );
  }

  const totalPrice = (availability.data?.totalPrice ?? 0) * roomCount;
  const serviceFee = Math.round(totalPrice * 0.02);
  const grandTotal = totalPrice + serviceFee;
  const canContinue = !!roomType && (availability.data?.available ?? 0) > 0 && roomCount <= (availability.data?.available ?? 0);

  const primaryAction =
    step === "room"
      ? { label: "Continue", disabled: !canContinue, onClick: () => setStep("guest") }
      : step === "guest"
        ? {
            label: "Continue",
            // A non-empty check let a 2-character "phone" through. The number
            // has to actually be complete for its country code.
            disabled: !guestName.trim() || !isValidPhone(guestPhone),
            onClick: () => setStep("payment"),
          }
        : { label: submitting ? "Booking…" : `Pay रू ${grandTotal.toLocaleString()}`, disabled: submitting, onClick: submit };

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-6 pb-24">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          {(["room", "guest", "payment"] as Step[]).map((s, i, arr) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                ["room","guest","payment"].indexOf(step) >= i ? "bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent" : "bg-surface-2 text-muted-fg",
              )}>
                {s === "room" && <BedDouble className="size-4" />}
                {s === "guest" && <Users className="size-4" />}
                {s === "payment" && <CreditCard className="size-4" />}
                <span className="hidden sm:inline capitalize">{s === "room" ? "Room & dates" : s}</span>
              </div>
              {i < arr.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {step === "room" && (
          <Card className="p-5">
            <h3 className="mb-3 font-display text-sm font-semibold">Choose room type</h3>
            <div className="space-y-2.5">
              {hotel.roomTypes.map((r) => (
                <button key={r.id} type="button" onClick={() => setRoomType(r)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                    roomType?.id === r.id ? "border-teal-700 bg-teal-100 dark:border-accent dark:bg-white/10" : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-fg">Sleeps up to {r.maxGuests} guests</p>
                    {r.description && <p className="mt-0.5 truncate text-xs text-muted-fg">{r.description}</p>}
                  </div>
                  <p className="shrink-0 whitespace-nowrap font-display text-sm font-bold font-tabular">रू {r.pricePerNight.toLocaleString()}/night</p>
                </button>
              ))}
            </div>
            <h3 className="mb-3 mt-6 flex items-center gap-1.5 font-display text-sm font-semibold">
              <CalendarRange className="size-4" /> Dates & guests
            </h3>
            {/* 2-up, not 4: this renders inside the fixed 440px phone frame, where
                 four columns truncated the date fields to "Tu…" / "W…".
                 Tailwind breakpoints key off the viewport, so sm: was firing
                 on a desktop screen despite the frame being phone-width. */}
            <div className="grid grid-cols-2 gap-3">
              <DateField label="Check-in" value={checkIn} onChange={setCheckIn} />
              <DateField label="Check-out" value={checkOut} onChange={setCheckOut} minDate={checkIn} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-fg">Rooms</span>
                <Input type="number" min={1} max={Math.max(availability.data?.available ?? 1, 1)} value={roomCount}
                  onChange={(e) => setRoomCount(Math.max(1, parseInt(e.target.value, 10) || 1))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-fg">Guests</span>
                <Input type="number" min={1} max={roomType?.maxGuests ?? 20} value={guests}
                  onChange={(e) => setGuests(parseInt(e.target.value, 10) || 1)} />
              </label>
            </div>
            <div className="mt-4">
              {availability.state === "loading" && <p className="text-sm text-muted-fg">Checking availability…</p>}
              {availability.state !== "loading" && availability.data && (
                availability.data.available > 0
                  ? <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="size-4" /> {availability.data.available} room(s) available</p>
                  : <p className="text-sm font-medium text-danger">No rooms available for these dates.</p>
              )}
            </div>
          </Card>
        )}

        {step === "guest" && (
          <Card className="p-5">
            <h3 className="mb-3 font-display text-sm font-semibold">Guest details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <NameInput placeholder="Full name" value={guestName} onChange={setGuestName} />
              <PhoneField value={guestPhone} onChange={setGuestPhone} showError />
            </div>
          </Card>
        )}

        {step === "payment" && (
          <Card className="p-5">
            <h3 className="mb-4 font-display text-sm font-semibold">Payment method</h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                    method === m.id ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border hover:bg-surface-2",
                  )}
                >
                  {m.label}
                  {method === m.id && <CheckCircle2 className="size-4" />}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-fg">Demo checkout — no real payment is charged.</p>
          </Card>
        )}

        {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>

      {/* Summary rail — desktop only; mobile gets the fixed bottom bar instead */}
      <div className="hidden">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent">
              <BedDouble className="size-5" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold">{hotel.name}</p>
              {roomType && <Badge variant="accent">{roomType.name}</Badge>}
            </div>
          </div>
          <div className="mt-4 space-y-1.5 text-sm">
            <p className="flex items-center gap-1.5"><MapPin className="size-3.5 text-accent" /> {hotel.city}</p>
            <p className="flex items-center gap-1.5"><CalendarRange className="size-3.5 text-accent" /> {checkIn} → {checkOut}</p>
            <p className="flex items-center gap-1.5"><BedDouble className="size-3.5 text-accent" /> {roomCount} room(s)</p>
            <p className="flex items-center gap-1.5"><Users className="size-3.5 text-accent" /> {guests} guest(s)</p>
            <p className="flex items-center gap-1.5 text-muted-fg">
              <Clock className="size-3.5 text-accent" /> Check-in {hotel.checkInTime} • Check-out {hotel.checkOutTime}
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-sm font-semibold">Fare summary</h3>
          <dl className="space-y-2 text-sm">
            <Row label={`${availability.data?.nights ?? 0} night(s) × ${roomCount} room(s) × रू ${roomType?.pricePerNight.toLocaleString() ?? 0}`} value={`रू ${totalPrice.toLocaleString()}`} />
            <Row label="Service fee (2%)" value={`रू ${serviceFee.toLocaleString()}`} />
            <div className="border-t border-border pt-2">
              <Row label="Total" value={`रू ${grandTotal.toLocaleString()}`} bold />
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            {step !== "room" && (
              <Button variant="outline" className="flex-1"
                onClick={() => setStep(step === "payment" ? "guest" : "room")}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            <Button variant="accent" className="flex-1" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
              {primaryAction.label} {step !== "payment" && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </Card>
      </div>

      {/* Sticky mobile booking bar — mirrors BusDetailPage's pattern so the
          primary CTA stays reachable without scrolling past the room picker
          / forms on a phone. */}
      {/* bottom-[4.75rem] — the customer shell's own bottom tab bar (see
          CustomerShell) is a separate fixed element pinned to bottom-0; this
          sits directly above it instead of underneath/behind it. */}
      <div className="fixed inset-x-0 bottom-[4.75rem] z-50 border-t border-border bg-card/95 px-4 py-3 shadow-lift backdrop-blur-xl ">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {step !== "room" && (
            <Button variant="outline" size="icon" aria-label="Back" onClick={() => setStep(step === "payment" ? "guest" : "room")}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-fg">{roomCount} room{roomCount > 1 ? "s" : ""}</p>
            <p className="font-display text-base font-bold font-tabular leading-tight">रू {grandTotal.toLocaleString()}</p>
          </div>
          <Button variant="accent" className="shrink-0" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-fg">{label}</dt>
      <dd className={cn("font-tabular", bold ? "font-display font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}