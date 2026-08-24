import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Armchair, Bus, CheckCircle2, Clock, CreditCard, MapPin, Printer, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PhoneField, NameInput, isValidPhone } from "@/components/ui/phone-field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { BusScheduleDetail, BusTicket, Passenger } from "./types";
import { generateSeats, PAYMENT_METHODS } from "./types";
import { BusTicketModal } from "./BusTicketDocument";

const SERVICE_FEE_RATE = 0.02;
type Step = "seats" | "passengers" | "payment" | "done";

export function BusDetailPage() {
  // Matches the route param name in routes/index.tsx ("buses/:scheduleId").
  // It's mismatched, it doesn't hit `/buses/:id` at all — the request lands
  // on `/buses/` (empty id), which the router folds into `/buses`, the
  // *search* endpoint. That returns an array of every active trip instead
  // of one trip's detail, and the page renders that array as if it were a
  // single bus: every field reads undefined and the total comes out NaN.
  const { scheduleId: id = "" } = useParams();
  const navigate = useNavigate();

  const detail = useResource<BusScheduleDetail>(() => api.get(endpoints.buses.detail(id)), [id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Book your seat"
        subtitle="Pick seats, add passengers and confirm."
        actions={
          <Link to="/app/buses" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft className="size-4" /> All buses
          </Link>
        }
      />
      <AsyncBoundary state={detail.state} onRetry={detail.refetch} label="Bus details">
        {detail.data && <BookingFlow bus={detail.data} onDone={() => navigate("/app/buses/tickets")} />}
      </AsyncBoundary>
    </div>
  );
}

function BookingFlow({ bus, onDone }: { bus: BusScheduleDetail; onDone: () => void }) {
  const [step, setStep] = useState<Step>("seats");
  const [selected, setSelected] = useState<string[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [method, setMethod] = useState("esewa");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const totalPrice = selected.length * bus.price;
  const serviceFee = Math.round(totalPrice * SERVICE_FEE_RATE);
  const grandTotal = totalPrice + serviceFee;

  function goPassengers() {
    setPassengers(selected.map((): Passenger => ({ firstName: "", lastName: "", email: "", phone: "", age: 0, gender: "male" })));
    setStep("passengers");
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ bookingRef: string }>(endpoints.buses.book(bus.id), { seats: selected, passengers, method });
      setRef(res.bookingRef);
      setStep("done");
      toast.success("Booking confirmed", `Reference ${res.bookingRef}`);
    } catch (e) {
      setError(e instanceof ApiError ? ((e.detail as { message?: string })?.message ?? "Booking failed. Please try again.") : "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <Confirmation
        bus={bus} seats={selected} passengers={passengers} method={method}
        totalPrice={totalPrice} serviceFee={serviceFee} grandTotal={grandTotal}
        bookingRef={ref} onDone={onDone}
      />
    );
  }

  const primaryAction =
    step === "seats"
      ? { label: "Continue", disabled: selected.length === 0, onClick: goPassengers }
      : step === "passengers"
        ? { label: "Continue", disabled: !passengersValid(passengers), onClick: () => setStep("payment") }
        : { label: submitting ? "Booking…" : `Pay रू ${grandTotal.toLocaleString()}`, disabled: submitting, onClick: submit };

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-6 pb-24">
        <Stepper step={step} />
        <TripSummary bus={bus} />

        {step === "seats" && <SeatPicker bus={bus} selected={selected} setSelected={setSelected} />}
        {step === "passengers" && <PassengerForm seats={selected} passengers={passengers} setPassengers={setPassengers} />}
        {step === "payment" && <PaymentPicker method={method} setMethod={setMethod} />}

        {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>

      {/* Sticky booking bar — the one Level-2 element on this screen. */}
      <div className="fixed inset-x-0 bottom-[4.75rem] z-50 border-t border-border bg-card/95 px-4 py-3 shadow-e2 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {step !== "seats" && (
            <Button variant="secondary" size="icon" aria-label="Back" onClick={() => setStep(step === "payment" ? "passengers" : "seats")}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption text-muted-fg">{selected.length > 0 ? `${selected.length} seat${selected.length > 1 ? "s" : ""}` : "No seats yet"}</p>
            <p className={cn("font-display font-extrabold font-tabular leading-none", step === "payment" ? "text-display" : "text-h1")}>
              रू {grandTotal.toLocaleString()}
            </p>
          </div>
          <Button variant="accent" className="shrink-0" loading={submitting} disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- sub-views ---------------------------------- */

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "seats", label: "Seats", icon: <Armchair className="size-4" /> },
    { id: "passengers", label: "Passengers", icon: <Users className="size-4" /> },
    { id: "payment", label: "Payment", icon: <CreditCard className="size-4" /> },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex flex-1 items-center gap-2">
          <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium", i <= idx ? "bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent" : "bg-surface-2 text-muted-fg")}>
            {s.icon} <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function SeatPicker({ bus, selected, setSelected }: { bus: BusScheduleDetail; selected: string[]; setSelected: (s: string[]) => void }) {
  const seats = useMemo(() => generateSeats(bus.totalRows, bus.bookedSeats), [bus]);
  const rows = useMemo(() => {
    const map = new Map<number, typeof seats>();
    seats.forEach((s) => { if (!map.has(s.row)) map.set(s.row, []); map.get(s.row)!.push(s); });
    return [...map.entries()];
  }, [seats]);

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const availableCount = seats.filter((s) => !s.booked).length;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold">Choose your seats</h3>
          <p className="text-xs text-muted-fg">{availableCount} of {seats.length} seats available</p>
        </div>
        <div className="flex items-center gap-3 text-caption text-muted-fg">
          <Legend className="border border-border bg-surface" label="Available" />
          <Legend className="bg-teal-700" label="Selected" />
          <Legend className="bg-muted" label="Booked" />
        </div>
      </div>

      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface/60 p-4">
        <div className="mb-3 flex items-center justify-end gap-1.5 text-xs text-muted-fg"><Bus className="size-4" /> front</div>
        <div className="space-y-2">
          {rows.map(([row, rowSeats]) => (
            <div key={row} className="flex items-center justify-center gap-2">
              <span className="w-5 text-center text-xs text-muted-fg">{row}</span>
              <div className="flex gap-1.5">{rowSeats.slice(0, 2).map((s) => <SeatButton key={s.id} {...seatProps(s, selected, toggle)} />)}</div>
              <div className="w-5" />
              <div className="flex gap-1.5">{rowSeats.slice(2, 4).map((s) => <SeatButton key={s.id} {...seatProps(s, selected, toggle)} />)}</div>
            </div>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <p className="mt-4 text-center text-sm">Selected: <span className="font-semibold text-accent">{selected.join(", ")}</span></p>
      )}
    </Card>
  );
}

function seatProps(s: { id: string; booked: boolean }, selected: string[], toggle: (id: string) => void) {
  return { id: s.id, booked: s.booked, selected: selected.includes(s.id), onClick: () => !s.booked && toggle(s.id) };
}

function SeatButton({ id, booked, selected, onClick }: { id: string; booked: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button" disabled={booked} onClick={onClick} aria-pressed={selected}
      aria-label={`Seat ${id}${booked ? ", booked" : selected ? ", selected" : ", available"}`}
      className={cn(
        "relative grid size-10 place-items-center rounded-sm font-display text-body-sm font-semibold",
        "transition-[background-color,border-color,color,transform] duration-fast ease-micro active:scale-[0.92]",
        booked && "cursor-not-allowed bg-muted text-muted-fg/60",
        !booked && selected && "scale-[1.04] bg-teal-700 text-white",
        !booked && !selected && "border border-border bg-surface text-fg hover:border-teal-700",
      )}
    >
      {selected && !booked && (
        <span key={`${id}-pulse`} aria-hidden className="pointer-events-none absolute inset-0 animate-seat-pulse rounded-sm ring-2 ring-amber-500" />
      )}
      {id}
    </button>
  );
}

function PassengerForm({ seats, passengers, setPassengers }: { seats: string[]; passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  function update(i: number, patch: Partial<Passenger>) {
    setPassengers(passengers.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  return (
    <div className="space-y-4">
      {passengers.map((p, i) => (
        <Card key={i} className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="accent">Seat {seats[i]}</Badge>
            <span className="text-sm font-medium">Passenger {i + 1}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NameInput placeholder="First name" value={p.firstName} onChange={(v) => update(i, { firstName: v })} />
            <NameInput placeholder="Last name" value={p.lastName} onChange={(v) => update(i, { lastName: v })} />
            <Input
              placeholder="Email" type="email" inputMode="email" value={p.email}
              onChange={(e) => update(i, { email: e.target.value })}
              error={p.email.trim().length > 0 && !isValidEmail(p.email)}
            />
            <PhoneField value={p.phone} onChange={(v) => update(i, { phone: v })} showError />
            <Input
              placeholder="Age" type="number" inputMode="numeric" min={1} max={120} value={p.age || ""}
              onChange={(e) => update(i, { age: Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
              error={p.age > 0 && (p.age < 1 || p.age > 120)}
            />
            <SegmentedControl
              options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]}
              value={p.gender} onChange={(gender) => update(i, { gender })}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

function PaymentPicker({ method, setMethod }: { method: string; setMethod: (m: string) => void }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-display text-sm font-semibold">Payment method</h3>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.id} type="button" onClick={() => setMethod(m.id)}
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
      <p className="mt-3 text-xs text-muted-fg">Wallet is debited instantly on confirm. Other methods are recorded and settled per that provider's flow.</p>
    </Card>
  );
}

function Confirmation({
  bus, seats, passengers, method, totalPrice, serviceFee, grandTotal, bookingRef, onDone,
}: {
  bus: BusScheduleDetail; seats: string[]; passengers: Passenger[]; method: string;
  totalPrice: number; serviceFee: number; grandTotal: number; bookingRef: string | null; onDone: () => void;
}) {
  const [showTicket, setShowTicket] = useState(false);

  const ticket: BusTicket = {
    id: bookingRef ?? "pending",
    bookingRef,
    status: "CONFIRMED",
    bus: { operator: bus.operator, from: bus.from, to: bus.to, date: bus.date, departure: bus.departure, arrival: bus.arrival, type: bus.type },
    seats, passengers, totalPrice, serviceFee, grandTotal, method,
    bookedAt: new Date().toISOString(),
  };

  return (
    <>
      <Card className="mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </div>
        <h2 className="font-display text-xl font-bold">Booking confirmed!</h2>
        <p className="mt-1 text-sm text-muted-fg">Your seats are locked in. Have a safe journey.</p>

        <div className="mt-6 space-y-2 rounded-xl border border-border bg-surface/60 p-5 text-left text-sm">
          {bookingRef && <Row label="Reference" value={bookingRef} bold />}
          <Row label="Route" value={`${bus.from} → ${bus.to}`} />
          <Row label="Departure" value={`${bus.date} • ${bus.departure}`} />
          <Row label="Seats" value={seats.join(", ")} />
          <Row label="Paid" value={`रू ${grandTotal.toLocaleString()}`} bold />
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={() => setShowTicket(true)}>
            <Printer className="size-4" /> Download / Print ticket
          </Button>
          <Button variant="accent" className="flex-1" onClick={onDone}>View my tickets</Button>
        </div>
      </Card>

      <BusTicketModal ticket={ticket} open={showTicket} onClose={() => setShowTicket(false)} />
    </>
  );
}

/* ----------------------------- shared bits -------------------------------- */

function TripSummary({ bus }: { bus: BusScheduleDetail }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent">
          <Bus className="size-5" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold">{bus.operator}</p>
          <Badge variant="accent">{bus.type}</Badge>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm">
        <p className="flex items-center gap-1.5"><MapPin className="size-3.5 text-accent" /> {bus.from} → {bus.to}</p>
        <p className="flex items-center gap-1.5"><Clock className="size-3.5 text-accent" /> {bus.departure} – {bus.arrival} ({bus.duration})</p>
        <p className="text-muted-fg">{bus.date}</p>
      </div>
    </Card>
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

function Legend({ className, label }: { className?: string; label: string }) {
  return <span className="flex items-center gap-1"><span className={cn("size-3 rounded", className)} /> {label}</span>;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function passengersValid(passengers: Passenger[]): boolean {
  return passengers.length > 0 && passengers.every(
    (p) => p.firstName.trim().length > 0 && p.lastName.trim().length > 0 && isValidEmail(p.email) && isValidPhone(p.phone) && p.age >= 1 && p.age <= 120,
  );
}