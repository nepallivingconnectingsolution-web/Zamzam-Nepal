import { useState } from "react";
import { Bus, CalendarClock, ChevronDown, ChevronUp, Plus, Repeat, Ticket, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { BusTicket, OperatorBus, OperatorSchedule, OperatorTrip } from "./types";
import { AMENITIES, BUS_TYPES, FUEL_TYPES, NEPAL_CITIES, WEEKDAYS } from "./types";
import type { ScheduleFormState } from "./schedule-form.utils";
import { buildSchedulePayload, computeMissingScheduleFields, plusDays } from "./schedule-form.utils";

type Tab = "fleet" | "schedules" | "bookings";

export function OperatorBusManager({
  title = "Buses",
  subtitle = "Register buses, publish schedules and track ticket sales.",
  initialTab = "fleet",
}: {
  title?: string;
  subtitle?: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === "fleet"} onClick={() => setTab("fleet")} icon={<Bus className="size-4" />} label="Fleet" />
        <TabButton active={tab === "schedules"} onClick={() => setTab("schedules")} icon={<CalendarClock className="size-4" />} label="Schedules" />
        <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")} icon={<Ticket className="size-4" />} label="Bookings" />
      </div>

      {tab === "fleet" && <FleetTab />}
      {tab === "schedules" && <SchedulesTab />}
      {tab === "bookings" && <BookingsTab />}
    </div>
  );
}

/* ================================ FLEET =================================== */

function FleetTab() {
  const fleet = useResource<OperatorBus[]>(() => api.get(endpoints.buses.op.buses), []);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close form" : "Add bus"}
        </Button>
      </div>

      {open && <AddBusForm onAdded={() => { setOpen(false); fleet.refetch(); }} />}

      <AsyncBoundary
        state={fleet.state}
        onRetry={fleet.refetch}
        label="Your fleet"
        empty={<EmptyState icon={<Bus className="size-6" />} title="No buses yet" description="Add your first bus, then publish schedules for it under the Schedules tab." />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {fleet.data?.map((b) => (
            <BusCard key={b.id} bus={b} onRemoved={fleet.refetch} />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function BusCard({ bus, onRemoved }: { bus: OperatorBus; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.delete(endpoints.buses.op.bus(bus.id));
      toast.success("Bus removed", "It's no longer in your fleet.");
      onRemoved();
    } catch (e) {
      toast.error(errMsg(e, "Could not remove bus"));
      setRemoving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">{bus.busName}</h3>
          <p className="text-sm text-muted-fg">{bus.busNumber} • {bus.registrationNo}</p>
        </div>
        <Badge variant="accent">{bus.type}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-fg">
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{bus.totalSeats} seats</span>
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{bus.fuelType}</span>
        {bus.amenities.map((a) => (
          <span key={a} className="rounded-md bg-surface-2 px-2 py-0.5">{a}</span>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" disabled={removing} onClick={handleRemove}>
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>
    </Card>
  );
}

function AddBusForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({
    busName: "",
    busNumber: "",
    registrationNo: "",
    type: BUS_TYPES[0] as string,
    fuelType: FUEL_TYPES[0] as string,
    totalSeats: 40,
    amenities: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggleAmenity(a: string) {
    set("amenities", form.amenities.includes(a) ? form.amenities.filter((x) => x !== a) : [...form.amenities, a]);
  }

  const canSubmit = !busy && form.busName.trim() !== "" && form.busNumber.trim() !== "" && form.registrationNo.trim() !== "";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(endpoints.buses.op.buses, {
        busName: form.busName,
        busNumber: form.busNumber,
        registrationNo: form.registrationNo,
        type: form.type,
        fuelType: form.fuelType,
        totalSeats: Number(form.totalSeats),
        totalRows: Math.ceil(Number(form.totalSeats) / 4),
        amenities: form.amenities,
      });
      toast.success("Bus added", "Your new vehicle is ready to schedule.");
      onAdded();
    } catch (e) {
      setError(errMsg(e, "Could not register bus"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-4 font-display text-sm font-semibold">Register a bus</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Bus name"><Input value={form.busName} onChange={(e) => set("busName", e.target.value)} placeholder="Zamzam Deluxe" /></Labeled>
        <Labeled label="Bus number"><Input value={form.busNumber} onChange={(e) => set("busNumber", e.target.value)} placeholder="BA 1 KHA 1234" /></Labeled>
        <Labeled label="Registration no."><Input value={form.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} placeholder="LU-01-002-1234" /></Labeled>
        <Labeled label="Total seats"><Input type="number" value={form.totalSeats} onChange={(e) => set("totalSeats", Number(e.target.value))} /></Labeled>
        <SelectField
          label="Bus type"
          value={form.type}
          onChange={(v) => set("type", v)}
          options={BUS_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <SelectField
          label="Fuel type"
          value={form.fuelType}
          onChange={(v) => set("fuelType", v)}
          options={FUEL_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </div>

      <div className="mt-4">
        <span className="mb-2 block text-xs font-medium text-muted-fg">Amenities</span>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleAmenity(a.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                form.amenities.includes(a.id) ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border hover:bg-surface-2",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-fg">
        After saving, head to the <span className="font-medium text-fg">Schedules</span> tab to publish routes for this bus — including daily or weekly recurring trips and return journeys.
      </p>

      {error && <p className="mt-3 text-body text-error">{error}</p>}

      <div className="mt-4 flex justify-end">
        <Button variant="accent" disabled={!canSubmit} loading={busy} onClick={submit}>
          Register bus
        </Button>
      </div>
    </Card>
  );
}

/* ============================== SCHEDULES ================================= */

function SchedulesTab() {
  const schedules = useResource<OperatorSchedule[]>(() => api.get(endpoints.buses.op.schedules), []);
  const fleet = useResource<OperatorBus[]>(() => api.get(endpoints.buses.op.buses), []);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpanded(scheduleId: string) {
    setExpandedId((current) => (current === scheduleId ? null : scheduleId));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setOpen((v) => !v)} disabled={fleet.state === "empty"}>
          <Plus className="size-4" /> {open ? "Close form" : "Add schedule"}
        </Button>
      </div>

      {fleet.state === "empty" && (
        <p className="text-sm text-muted-fg">Add a bus under the Fleet tab first, then come back here to publish its routes.</p>
      )}

      {open && fleet.data && (
        <AddScheduleForm buses={fleet.data} onAdded={() => { setOpen(false); schedules.refetch(); }} />
      )}

      <AsyncBoundary
        state={schedules.state}
        onRetry={schedules.refetch}
        label="Schedules"
        empty={<EmptyState icon={<CalendarClock className="size-6" />} title="No schedules yet" description="Publish a route so customers can book it. Run it once, daily, or on chosen weekdays — and add the return leg as a second schedule." />}
      >
        <div className="space-y-3">
          {schedules.data?.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              expanded={expandedId === s.id}
              onToggleExpanded={() => toggleExpanded(s.id)}
              onDeleted={schedules.refetch}
            />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function ScheduleCard({
  schedule,
  expanded,
  onToggleExpanded,
  onDeleted,
}: {
  schedule: OperatorSchedule;
  expanded: boolean;
  onToggleExpanded: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(endpoints.buses.op.schedule(schedule.id));
      toast.success("Schedule deleted");
      onDeleted();
    } catch (e) {
      toast.error(errMsg(e, "Could not delete schedule"));
      setDeleting(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-sm font-semibold">{schedule.fromCity} → {schedule.toCity}</h3>
            <Badge variant={schedule.status === "active" ? "success" : "danger"}>{schedule.status}</Badge>
            <FrequencyBadge schedule={schedule} />
          </div>
          <p className="mt-1 text-sm text-muted-fg">
            {schedule.busName} • {schedule.departure}–{schedule.arrival} ({schedule.duration})
          </p>
          <p className="mt-1 text-sm">
            रू {schedule.price.toLocaleString()} • {schedule.upcomingTrips} upcoming departure{schedule.upcomingTrips === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleExpanded}>
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {expanded ? "Hide dates" : "View dates"}
          </Button>
          <Button variant="ghost" size="sm" disabled={deleting} onClick={handleDelete}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>

      {expanded && <ScheduleTripsList scheduleId={schedule.id} />}
    </Card>
  );
}

function FrequencyBadge({ schedule }: { schedule: OperatorSchedule }) {
  if (schedule.frequency === "once") {
    return <Badge variant="accent">One-time • {schedule.onceDate}</Badge>;
  }
  if (schedule.frequency === "daily") {
    return (
      <Badge variant="accent">
        <Repeat className="mr-1 inline size-3" /> Daily
      </Badge>
    );
  }
  const days = schedule.operatingDays
    .slice()
    .sort()
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? "")
    .join(", ");
  return (
    <Badge variant="accent">
      <Repeat className="mr-1 inline size-3" /> Weekly • {days}
    </Badge>
  );
}

function ScheduleTripsList({ scheduleId }: { scheduleId: string }) {
  const trips = useResource<OperatorTrip[]>(() => api.get(endpoints.buses.op.scheduleTrips(scheduleId)), [scheduleId]);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <AsyncBoundary
        state={trips.state}
        onRetry={trips.refetch}
        label="Departures"
        empty={<p className="text-sm text-muted-fg">No departures generated yet for this schedule.</p>}
      >
        <div className="max-h-72 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {trips.data?.map((t) => (
            <TripRow key={t.id} trip={t} onCancelled={trips.refetch} />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function TripRow({ trip, onCancelled }: { trip: OperatorTrip; onCancelled: () => void }) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.patch(endpoints.buses.op.trip(trip.id), { status: "cancelled" });
      toast.success("Departure cancelled", "Confirmed passengers were automatically refunded and notified.");
      onCancelled();
    } catch (e) {
      toast.error(errMsg(e, "Could not cancel this departure"));
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{trip.date}</span>
        <span className="text-muted-fg">{trip.departure}–{trip.arrival}</span>
        <Badge variant={trip.status === "scheduled" ? "success" : trip.status === "cancelled" ? "danger" : "accent"}>
          {trip.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
        <span className="text-muted-fg">{trip.seatsLeft}/{trip.totalSeats} seats free</span>
        {trip.status === "scheduled" && (
          <Button variant="ghost" size="sm" disabled={cancelling} onClick={handleCancel}>
            Cancel this date
          </Button>
        )}
      </div>
    </div>
  );
}

function AddScheduleForm({ buses, onAdded }: { buses: OperatorBus[]; onAdded: () => void }) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<ScheduleFormState>({
    busId: buses[0]?.id ?? "",
    fromCity: "",
    toCity: "",
    departureTime24: "",
    arrivalTime24: "",
    price: 1000,
    frequency: "once",
    onceDate: "",
    operatingDays: [],
    validFrom: todayIso,
    validUntil: "",
    addReturn: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ScheduleFormState>(k: K, v: ScheduleFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggleDay(d: number) {
    set("operatingDays", form.operatingDays.includes(d) ? form.operatingDays.filter((x) => x !== d) : [...form.operatingDays, d]);
  }

  const missing = computeMissingScheduleFields(form);
  const canSubmit = missing.length === 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const requests = [api.post(endpoints.buses.op.schedules, buildSchedulePayload(form, form.fromCity, form.toCity))];
      if (form.addReturn) {
        requests.push(api.post(endpoints.buses.op.schedules, buildSchedulePayload(form, form.toCity, form.fromCity)));
      }
      await Promise.all(requests);
      toast.success("Schedule created", "Departures have been generated.");
      onAdded();
    } catch (e) {
      setError(errMsg(e, "Could not create schedule"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-4 font-display text-sm font-semibold">Publish a schedule</h3>
      <CityOptions />

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Bus"
          value={form.busId}
          onChange={(v) => set("busId", v)}
          options={buses.map((b) => ({ value: b.id, label: `${b.busName} (${b.busNumber})` }))}
        />
        <Labeled label="Price (रू)"><Input type="number" className="font-tabular" value={form.price} onChange={(e) => set("price", Number(e.target.value))} /></Labeled>
        <Labeled label="From"><CityInput value={form.fromCity} onChange={(v) => set("fromCity", v)} /></Labeled>
        <Labeled label="To"><CityInput value={form.toCity} onChange={(v) => set("toCity", v)} /></Labeled>
        <TimeField label="Departure time" value={form.departureTime24} onChange={(v) => set("departureTime24", v)} />
        <TimeField label="Arrival time" value={form.arrivalTime24} onChange={(v) => set("arrivalTime24", v)} />
      </div>

      <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-border p-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-accent"
          checked={form.addReturn}
          onChange={(e) => set("addReturn", e.target.checked)}
          disabled={!form.fromCity || !form.toCity}
        />
        <span className="text-sm">
          <span className="font-medium">Also publish the return journey</span>
          <span className="block text-xs text-muted-fg">
            {form.toCity && form.fromCity
              ? `Adds a second schedule: ${form.toCity} → ${form.fromCity}, same bus, times, price and frequency.`
              : "Fill in From and To first."}
          </span>
        </span>
      </label>

      <div className="mt-5 rounded-xl border border-dashed border-border p-4">
        <p className="mb-3 text-xs font-medium text-muted-fg">How often does this run?</p>
        <div className="flex flex-wrap gap-2">
          <FrequencyOption label="Just this once" active={form.frequency === "once"} onClick={() => set("frequency", "once")} />
          <FrequencyOption label="Every day" active={form.frequency === "daily"} onClick={() => set("frequency", "daily")} />
          <FrequencyOption label="Specific weekdays" active={form.frequency === "weekly"} onClick={() => set("frequency", "weekly")} />
        </div>

        {form.frequency === "once" && (
          <div className="mt-4">
            <DateField label="Date" value={form.onceDate} onChange={(v) => set("onceDate", v)} minDate={todayIso} />
          </div>
        )}

        {form.frequency === "weekly" && (
          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium text-muted-fg">Runs on</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => toggleDay(w.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    form.operatingDays.includes(w.value) ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border hover:bg-surface-2",
                  )}
                >
                  {w.short}
                </button>
              ))}
            </div>
          </div>
        )}

        {(form.frequency === "daily" || form.frequency === "weekly") && (
          <div className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField label="Starting from" value={form.validFrom} onChange={(v) => set("validFrom", v)} minDate={todayIso} />
              <DateField
                label="Ends on (optional — leave blank to run indefinitely)"
                value={form.validUntil}
                onChange={(v) => set("validUntil", v)}
                minDate={form.validFrom || todayIso}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-xs text-muted-fg">Quick fill:</span>
              <button type="button" className="text-xs text-accent underline-offset-2 hover:underline" onClick={() => set("validUntil", plusDays(form.validFrom || todayIso, 7))}>
                Run for 1 week
              </button>
              <button type="button" className="text-xs text-accent underline-offset-2 hover:underline" onClick={() => set("validUntil", plusDays(form.validFrom || todayIso, 30))}>
                Run for 1 month
              </button>
              <button type="button" className="text-xs text-muted-fg underline-offset-2 hover:underline" onClick={() => set("validUntil", "")}>
                Clear (run indefinitely)
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-body text-error">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {!canSubmit && (
          <p className="text-body-sm text-muted-fg">
            Still needed: <span className="font-medium text-fg">{missing.join(", ")}</span>
          </p>
        )}
        <Button variant="accent" loading={busy} disabled={!canSubmit} onClick={submit}>
          {form.addReturn ? "Publish both schedules" : "Publish schedule"}
        </Button>
      </div>
    </Card>
  );
}

function FrequencyOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border hover:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}

/* ============================== BOOKINGS ================================== */

function BookingsTab() {
  const bookings = useResource<BusTicket[]>(() => api.get(endpoints.buses.op.bookings), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AsyncBoundary
      state={bookings.state}
      onRetry={bookings.refetch}
      label="Bookings"
      empty={<EmptyState icon={<Ticket className="size-6" />} title="No bookings yet" description="Tickets sold on your schedules appear here." />}
    >
      <div className="space-y-3">
        {bookings.data?.map((b) => {
          const isOpen = expandedId === b.id;
          return (
            <Card key={b.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : b.id)}
                className="flex w-full flex-col gap-2 p-5 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-sm font-semibold">{b.bus?.from} → {b.bus?.to}</h3>
                    <Badge variant={b.status === "CONFIRMED" ? "success" : b.status === "CANCELLED" ? "danger" : "accent"}>
                      {b.status.toLowerCase()}
                    </Badge>
                    {b.bookingRef && <span className="text-xs text-muted-fg">{b.bookingRef}</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-fg">
                    {b.bus?.date} • {b.bus?.departure} • Seats {b.seats.join(", ")} • {b.passengers.length} pax
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-display text-lg font-bold font-tabular">रू {b.grandTotal.toLocaleString()}</p>
                  {isOpen ? <ChevronUp className="size-4 shrink-0 text-muted-fg" /> : <ChevronDown className="size-4 shrink-0 text-muted-fg" />}
                </div>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border bg-muted/30 p-5">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-fg">
                      Passengers ({b.passengers.length})
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {b.passengers.map((p, i) => (
                        <div key={i} className="rounded-xl border border-border bg-card p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{p.firstName} {p.lastName}</span>
                            <Badge variant="accent">Seat {b.seats[i] ?? "—"}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-fg">{p.age} yrs • {p.gender}</p>
                          <p className="text-xs text-muted-fg">{p.email}</p>
                          <p className="text-xs text-muted-fg">{p.phone}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-3 text-sm">
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">Payment</h4>
                      <div className="flex justify-between text-muted-fg"><span>Fare</span><span className="font-tabular">रू {b.totalPrice.toLocaleString()}</span></div>
                      <div className="flex justify-between text-muted-fg"><span>Service fee</span><span className="font-tabular">रू {b.serviceFee.toLocaleString()}</span></div>
                      <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium"><span>Total paid</span><span className="font-tabular">रू {b.grandTotal.toLocaleString()}</span></div>
                      <p className="mt-1.5 text-xs capitalize text-muted-fg">Method: {b.method ?? "—"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 text-sm">
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">Journey</h4>
                      <p className="text-muted-fg">Ref: <span className="text-fg">{b.bookingRef ?? "—"}</span></p>
                      <p className="text-muted-fg">Booked: <span className="text-fg">{new Date(b.bookedAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}</span></p>
                      <p className="text-muted-fg">Arrival: <span className="text-fg">{b.bus?.arrival ?? "—"}</span></p>
                      <p className="text-muted-fg">Bus type: <span className="text-fg">{b.bus?.type ?? "—"}</span></p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AsyncBoundary>
  );
}

/* ============================== helpers ================================== */

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-fg hover:text-fg",
      )}
    >
      {icon} {label}
    </button>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-fg">{label}</span>
      {children}
    </label>
  );
}

function CityInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Input list="op-cities" value={value} onChange={(e) => onChange(e.target.value)} placeholder="City" />;
}

function CityOptions() {
  return (
    <datalist id="op-cities">
      {NEPAL_CITIES.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const d = e.detail as { message?: string } | undefined;
    return d?.message ?? fallback;
  }
  return fallback;
}