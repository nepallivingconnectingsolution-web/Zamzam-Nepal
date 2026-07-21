import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bus, Clock, MapPin, Search, Ticket, Wind, Wifi, Zap } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { BusSearchResult } from "./types";
import { NEPAL_CITIES } from "./types";

const amenityIcon: Record<string, React.ReactNode> = {
  wifi: <Wifi className="size-3.5" />,
  ac: <Wind className="size-3.5" />,
  charging: <Zap className="size-3.5" />,
};

export function BusListPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "", date: "" });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    if (applied.date) params.set("date", applied.date);
    const qs = params.toString();
    return qs ? `${endpoints.buses.list}?${qs}` : endpoints.buses.list;
  }, [applied]);

  const buses = useResource<BusSearchResult[]>(() => api.get(query), [query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buses"
        subtitle="Book intercity bus seats across Nepal."
        actions={
          <Link to="/app/buses/tickets" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Ticket className="size-4" /> My tickets
          </Link>
        }
      />

      {/* Search bar */}
      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <Field label="From">
            <CityInput value={from} onChange={setFrom} placeholder="Departure city" />
          </Field>
          <Field label="To">
            <CityInput value={to} onChange={setTo} placeholder="Destination city" />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button variant="accent" onClick={() => setApplied({ from, to, date })}>
            <Search className="size-4" /> Search
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-fg">
          Leave fields empty to browse every active bus added by operators.
        </p>
      </Card>

      {/* Results */}
      <AsyncBoundary
        state={buses.state}
        onRetry={buses.refetch}
        label="Buses"
        empty={
          <EmptyState
            icon={<Bus className="size-6" />}
            title="No buses found"
            description="No active schedules match your search yet. Try different cities or clear the filters."
          />
        }
      >
        <div className="space-y-3">
          {buses.data?.map((b) => (
            <BusResultCard key={b.id} bus={b} />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function BusResultCard({ bus }: { bus: BusSearchResult }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Bus className="size-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold">{bus.operator}</h3>
              <Badge variant="accent">{bus.type}</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
              <MapPin className="size-3.5" /> {bus.from} <ArrowRight className="size-3.5" /> {bus.to}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="size-3.5 text-accent" /> {bus.departure} – {bus.arrival}
              </span>
              <span className="text-muted-fg">({bus.duration})</span>
              <span className="text-muted-fg">{bus.date}</span>
            </div>
            {bus.amenities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bus.amenities.slice(0, 5).map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg"
                  >
                    {amenityIcon[a]} {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          <div className="text-right">
            <p className="font-display text-xl font-bold">रू {bus.price.toLocaleString()}</p>
            <p className="text-xs text-muted-fg">
              {bus.seatsLeft > 0 ? `${bus.seatsLeft} seats left` : "Sold out"}
            </p>
          </div>
          {bus.seatsLeft > 0 ? (
            <Link to={`/app/buses/${bus.id}`} className={cn(buttonVariants({ variant: "accent" }))}>
              Select seats <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Button variant="outline" disabled>
              Full
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-fg">{label}</span>
      {children}
    </label>
  );
}

function CityInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Input
        list="nepal-cities"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id="nepal-cities">
        {NEPAL_CITIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
