import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  Bus,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Printer,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { scheduleId = "" } = useParams();
  const navigate = useNavigate();

  const detail = useResource<BusScheduleDetail>(
    () => api.get(endpoints.buses.detail(scheduleId)),
    [scheduleId],
  );

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
    setPassengers(
      selected.map(
        (): Passenger => ({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          age: 0,
          gender: "male",
        }),
      ),
    );
    setStep("passengers");
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ bookingRef: string }>(endpoints.buses.book(bus.id), {
        seats: selected,
        passengers,
        method,
      });
      setRef(res.bookingRef);
      setStep("done");
      toast.success("Booking confirmed", `Reference ${res.bookingRef}`);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? ((e.detail as { message?: string })?.message ?? "Booking failed. Please try again.")
          : "Booking failed. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <Confirmation
        bus={bus}
        seats={selected}
        passengers={passengers}
        method={method}
        totalPrice={totalPrice}
        serviceFee={serviceFee}
        grandTotal={grandTotal}
        bookingRef={ref}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Stepper step={step} />

        {step === "seats" && (
          <SeatPicker bus={bus} selected={selected} setSelected={setSelected} />
        )}

        {step === "passengers" && (
          <PassengerForm seats={selected} passengers={passengers} setPassengers={setPassengers} />
        )}

        {step === "payment" && <PaymentPicker method={method} setMethod={setMethod} />}

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {/* Summary rail */}
      <div className="space-y-4">
        <TripSummary bus={bus} />
        <Card className="p-5">
          <h3 className="mb-3 font-display text-sm font-semibold">Fare summary</h3>
          <dl className="space-y-2 text-sm">
            <Row label={`Seats (${selected.length} × रू ${bus.price})`} value={`रू ${totalPrice.toLocaleString()}`} />
            <Row label="Service fee (2%)" value={`रू ${serviceFee.toLocaleString()}`} />
            <div className="border-t border-border pt-2">
              <Row label="Total" value={`रू ${grandTotal.toLocaleString()}`} bold />
            </div>
          </dl>

          <div className="mt-4 flex gap-2">
            {step !== "seats" && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(step === "payment" ? "passengers" : "seats")}
              >
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            {step === "seats" && (
              <Button
                variant="accent"
                className="flex-1"
                disabled={selected.length === 0}
                onClick={goPassengers}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            )}
            {step === "passengers" && (
              <Button
                variant="accent"
                className="flex-1"
                disabled={!passengersValid(passengers)}
                onClick={() => setStep("payment")}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            )}
            {step === "payment" && (
              <Button variant="accent" className="flex-1" disabled={submitting} onClick={submit}>
                {submitting ? "Booking…" : `Pay रू ${grandTotal.toLocaleString()}`}
              </Button>
            )}
          </div>
        </Card>
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
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
              i <= idx ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted-fg",
            )}
          >
            {s.icon} <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function SeatPicker({
  bus,
  selected,
  setSelected,
}: {
  bus: BusScheduleDetail;
  selected: string[];
  setSelected: (s: string[]) => void;
}) {
  const seats = useMemo(() => generateSeats(bus.totalRows, bus.bookedSeats), [bus]);
  const rows = useMemo(() => {
    const map = new Map<number, typeof seats>();
    seats.forEach((s) => {
      if (!map.has(s.row)) map.set(s.row, []);
      map.get(s.row)!.push(s);
    });
    return [...map.entries()];
  }, [seats]);

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">Choose your seats</h3>
        <div className="flex items-center gap-3 text-xs text-muted-fg">
          <Legend className="bg-surface-2 border border-border" label="Available" />
          <Legend className="bg-accent text-white" label="Selected" />
          <Legend className="bg-muted opacity-50" label="Booked" />
        </div>
      </div>

      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface/60 p-4">
        <div className="mb-3 flex items-center justify-end gap-1 text-xs text-muted-fg">
          <Bus className="size-4" /> front
        </div>
        <div className="space-y-2">
          {rows.map(([row, rowSeats]) => (
            <div key={row} className="flex items-center justify-center gap-2">
              <span className="w-5 text-center text-xs text-muted-fg">{row}</span>
              <div className="flex gap-1.5">
                {rowSeats.slice(0, 2).map((s) => (
                  <SeatButton key={s.id} {...seatProps(s, selected, toggle)} />
                ))}
              </div>
              <div className="w-5" />
              <div className="flex gap-1.5">
                {rowSeats.slice(2, 4).map((s) => (
                  <SeatButton key={s.id} {...seatProps(s, selected, toggle)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <p className="mt-4 text-center text-sm">
          Selected: <span className="font-semibold text-accent">{selected.join(", ")}</span>
        </p>
      )}
    </Card>
  );
}

function seatProps(
  s: { id: string; booked: boolean },
  selected: string[],
  toggle: (id: string) => void,
) {
  return {
    id: s.id,
    booked: s.booked,
    selected: selected.includes(s.id),
    onClick: () => !s.booked && toggle(s.id),
  };
}

function SeatButton({
  id,
  booked,
  selected,
  onClick,
}: {
  id: string;
  booked: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={booked}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-lg text-xs font-medium transition-colors",
        booked && "cursor-not-allowed bg-muted text-muted-fg opacity-50",
        !booked && selected && "bg-accent text-white shadow-sm",
        !booked && !selected && "border border-border bg-surface-2 hover:border-accent",
      )}
    >
      {id}
    </button>
  );
}

function PassengerForm({
  seats,
  passengers,
  setPassengers,
}: {
  seats: string[];
  passengers: Passenger[];
  setPassengers: (p: Passenger[]) => void;
}) {
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
            <Input placeholder="First name" value={p.firstName} onChange={(e) => update(i, { firstName: e.target.value })} />
            <Input placeholder="Last name" value={p.lastName} onChange={(e) => update(i, { lastName: e.target.value })} />
            <Input placeholder="Email" type="email" value={p.email} onChange={(e) => update(i, { email: e.target.value })} />
            <Input placeholder="Phone" value={p.phone} onChange={(e) => update(i, { phone: e.target.value })} />
            <Input
              placeholder="Age"
              type="number"
              value={p.age || ""}
              onChange={(e) => update(i, { age: parseInt(e.target.value, 10) || 0 })}
            />
            <select
              value={p.gender}
              onChange={(e) => update(i, { gender: e.target.value as Passenger["gender"] })}
              className="flex h-10 w-full rounded-xl border border-input bg-surface px-3.5 text-sm text-fg focus-visible:border-accent focus-visible:outline-none"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
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
            key={m.id}
            type="button"
            onClick={() => setMethod(m.id)}
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
              method === m.id ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2",
            )}
          >
            {m.label}
            {method === m.id && <CheckCircle2 className="size-4" />}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-fg">
        This is a demo checkout — no real payment gateway is charged. Wire your eSewa / Khalti keys to go live.
      </p>
    </Card>
  );
}

function Confirmation({
  bus,
  seats,
  passengers,
  method,
  totalPrice,
  serviceFee,
  grandTotal,
  bookingRef,
  onDone,
}: {
  bus: BusScheduleDetail;
  seats: string[];
  passengers: Passenger[];
  method: string;
  totalPrice: number;
  serviceFee: number;
  grandTotal: number;
  bookingRef: string | null;
  onDone: () => void;
}) {
  const [showTicket, setShowTicket] = useState(false);

  // Same shape BusBookingsPage gets from GET /buses/bookings/mine, built
  // client-side here so "Download / Print ticket" works immediately on the
  // confirmation screen without a second round-trip to the server.
  const ticket: BusTicket = {
    id: bookingRef ?? "pending",
    bookingRef,
    status: "CONFIRMED",
    bus: {
      operator: bus.operator,
      from: bus.from,
      to: bus.to,
      date: bus.date,
      departure: bus.departure,
      arrival: bus.arrival,
      type: bus.type,
    },
    seats,
    passengers,
    totalPrice,
    serviceFee,
    grandTotal,
    method,
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
          <Button variant="accent" className="flex-1" onClick={onDone}>
            View my tickets
          </Button>
        </div>
      </Card>

      {showTicket && <BusTicketModal ticket={ticket} onClose={() => setShowTicket(false)} />}
    </>
  );
}

/* ----------------------------- shared bits -------------------------------- */

function TripSummary({ bus }: { bus: BusScheduleDetail }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
          <Bus className="size-5" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold">{bus.operator}</p>
          <Badge variant="accent">{bus.type}</Badge>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm">
        <p className="flex items-center gap-1.5">
          <MapPin className="size-3.5 text-accent" /> {bus.from} → {bus.to}
        </p>
        <p className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-accent" /> {bus.departure} – {bus.arrival} ({bus.duration})
        </p>
        <p className="text-muted-fg">{bus.date}</p>
      </div>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-fg">{label}</dt>
      <dd className={cn(bold ? "font-display font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}

function Legend({ className, label }: { className?: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-3 rounded", className)} /> {label}
    </span>
  );
}

function passengersValid(passengers: Passenger[]): boolean {
  return (
    passengers.length > 0 &&
    passengers.every(
      (p) => p.firstName.trim() && p.lastName.trim() && p.email.trim() && p.phone.trim() && p.age > 0,
    )
  );
}