import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, Bus, ChevronDown, ImageOff, Search, Ticket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Chip } from "@/components/ui/chip";
import { SelectField } from "@/components/ui/select-field";
import { Icon } from "@/components/ui/icon";
import { TerrainLine } from "@/components/ui/terrain-line";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { BusSearchResult } from "./types";
import { AMENITIES, NEPAL_CITIES } from "./types";

const LOW_SEATS_THRESHOLD = 5;

type TypeFilter = "all" | "ac" | "non-ac" | "sleeper";
const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ac", label: "AC" },
  { id: "non-ac", label: "Non-AC" },
  { id: "sleeper", label: "Sleeper" },
];

function matchesTypeFilter(type: string, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  const t = type.toLowerCase();
  if (filter === "ac") return t.startsWith("ac ");
  if (filter === "non-ac") return t.startsWith("non-ac");
  return t.includes("sleeper");
}

type SortOption = "recommended" | "price" | "departure" | "duration";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Price: low to high" },
  { value: "departure", label: "Earliest departure" },
  { value: "duration", label: "Shortest duration" },
];

/** "7h 30m" / "45m" -> minutes. Unparseable input sorts last, doesn't crash. */
function durationMinutes(duration: string): number {
  const h = /(\d+)\s*h/.exec(duration);
  const m = /(\d+)\s*m/.exec(duration);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total || Number.POSITIVE_INFINITY;
}

/** "07:00 AM" -> minutes since midnight, for chronological sort. */
function timeMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(time);
  if (!m) return Number.POSITIVE_INFINITY;
  let h = Number(m[1]);
  if (m[3]?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3]?.toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

/* --------------------------- Recent searches ------------------------------- */
interface RecentRoute { from: string; to: string }
const RECENT_KEY = "zz_recent_bus_searches";
const MAX_RECENT = 5;

function loadRecentSearches(): RecentRoute[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RecentRoute => typeof r?.from === "string" && typeof r?.to === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentSearches(list: RecentRoute[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // Private-mode / quota-full localStorage — best-effort UX sugar only.
  }
}

export function BusListPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "", date: "" });
  const [swapRotation, setSwapRotation] = useState(0);

  function handleSwap() {
    setFrom(to);
    setTo(from);
    setSwapRotation((r) => r + 180);
  }

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    if (applied.date) params.set("date", applied.date);
    const qs = params.toString();
    return qs ? `${endpoints.buses.list}?${qs}` : endpoints.buses.list;
  }, [applied]);

  const buses = useResource<BusSearchResult[]>(() => api.get(query), [query]);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortOption>("recommended");
  const [recent, setRecent] = useState<RecentRoute[]>(() => loadRecentSearches());

  function runSearch(f: string, t: string, d: string) {
    setFrom(f);
    setTo(t);
    setApplied({ from: f, to: t, date: d });
    if (f.trim() && t.trim()) {
      setRecent((prev) => {
        const next = [{ from: f, to: t }, ...prev.filter((r) => !(r.from === f && r.to === t))].slice(0, MAX_RECENT);
        saveRecentSearches(next);
        return next;
      });
    }
  }

  const popularRoutes = useMemo(() => {
    if (applied.from || applied.to) return [];
    const counts = new Map<string, { from: string; to: string; count: number }>();
    for (const b of buses.data ?? []) {
      const key = `${b.from}→${b.to}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { from: b.from, to: b.to, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [buses.data, applied.from, applied.to]);

  const visibleBuses = useMemo(() => {
    const rows = (buses.data ?? []).filter((b) => matchesTypeFilter(b.type, typeFilter));
    if (sort === "price") return [...rows].sort((a, b) => a.price - b.price);
    if (sort === "departure") return [...rows].sort((a, b) => timeMinutes(a.departure) - timeMinutes(b.departure));
    if (sort === "duration") return [...rows].sort((a, b) => durationMinutes(a.duration) - durationMinutes(b.duration));
    return rows;
  }, [buses.data, typeFilter, sort]);

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

      <Card className="p-5">
        {/* The From/To pair holds two text inputs plus a swap button, so it
            needs roughly twice a single field's share of the row — giving it
            the same 1fr as Date (which is one field) starved it down to
            where the swap button's opaque circle, centered across the whole
            pair, covered most of the From field and all of the To field. */}
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
          <div className="relative grid gap-3 md:grid-cols-2">
            <Field label="From"><CityInput value={from} onChange={setFrom} placeholder="Departure city" /></Field>
            <Field label="To"><CityInput value={to} onChange={setTo} placeholder="Destination city" /></Field>
            <motion.button
              type="button"
              onClick={handleSwap}
              aria-label="Swap departure and destination"
              animate={{ rotate: swapRotation }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute left-1/2 top-1/2 z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-accent shadow-card transition-colors hover:border-accent active:scale-90"
            >
              <ArrowLeftRight className="size-4" />
            </motion.button>
          </div>
          <DateField label="Date" value={date} onChange={setDate} />
          <Button variant="accent" onClick={() => runSearch(from, to, date)}>
            <Search className="size-4" /> Search
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-fg">Leave fields empty to browse every active bus added by operators.</p>

        {recent.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-fg">Recent searches</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <Chip key={`${r.from}-${r.to}`} onClick={() => runSearch(r.from, r.to, date)}>
                  {r.from} <ArrowRight className="size-3" /> {r.to}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {popularRoutes.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-fg">Popular routes right now</p>
            <div className="flex flex-wrap gap-2">
              {popularRoutes.map((r) => (
                <Chip key={`${r.from}-${r.to}`} onClick={() => runSearch(r.from, r.to, date)}>
                  {r.from} <ArrowRight className="size-3" /> {r.to}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </Card>

      {(buses.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {TYPE_FILTERS.map((f) => (
              <Chip key={f.id} selected={typeFilter === f.id} onClick={() => setTypeFilter(f.id)}>{f.label}</Chip>
            ))}
          </div>
          <SelectField value={sort} onChange={(v) => setSort(v as SortOption)} options={SORT_OPTIONS} placeholder="Sort" className="w-full shrink-0 sm:w-44" />
        </div>
      )}

      <AsyncBoundary
        state={buses.state}
        onRetry={buses.refetch}
        label="Buses"
        empty={<EmptyState icon={<Bus className="size-6" />} title="No buses found" description="No active schedules match your search yet. Try different cities or clear the filters." />}
      >
        {visibleBuses.length === 0 ? (
          <EmptyState
            icon={<Bus className="size-6" />}
            title="No buses match this filter"
            description="Try a different bus type, or switch back to All."
            action={typeFilter !== "all" ? <Button variant="accent" onClick={() => setTypeFilter("all")}>Clear filter</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {visibleBuses.map((b) => <BusResultCard key={b.id} bus={b} />)}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

function AmenityChip({ id }: { id: string }) {
  const meta = AMENITIES.find((a) => a.id === id);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg">
      {meta ? <Icon name={meta.icon} className="size-3.5" /> : null}
      {meta?.label ?? id}
    </span>
  );
}

function BusResultCard({ bus }: { bus: BusSearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const soldOut = bus.seatsLeft <= 0;
  const lowSeats = !soldOut && bus.seatsLeft <= LOW_SEATS_THRESHOLD;
  const hiddenAmenities = bus.amenities.slice(5);
  const canExpand = hiddenAmenities.length > 0 || !!bus.busPhoto;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={cn("w-full p-5 text-left", canExpand && "cursor-pointer")}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <p className="font-display text-h1 font-extrabold font-tabular leading-none">{bus.departure}</p>
            <p className="mt-1 text-caption text-muted-fg">{bus.from}</p>
          </div>
          <div className="min-w-0 flex-1 px-1 text-center text-teal-700 dark:text-accent">
            <TerrainLine variant="mini" />
            <p className="mt-1 text-caption text-muted-fg">{bus.duration}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-h1 font-extrabold font-tabular leading-none">{bus.arrival}</p>
            <p className="mt-1 text-caption text-muted-fg">{bus.to}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-fg">
          <Bus className="size-3.5 shrink-0" />
          <span className="font-medium text-fg">{bus.operator}</span>
          <span aria-hidden>·</span>
          <span>{bus.type}</span>
          {bus.amenities.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{bus.amenities.length} amenities</span>
            </>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="font-display text-h1 font-extrabold font-tabular leading-none">रू {bus.price.toLocaleString()}</p>
            {soldOut ? (
              <p className="mt-1 text-caption text-muted-fg">Sold out</p>
            ) : lowSeats ? (
              <p className="mt-1 text-caption font-semibold text-warning">Only {bus.seatsLeft} seats left</p>
            ) : (
              <p className="mt-1 text-caption text-muted-fg">{bus.seatsLeft} seats left</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canExpand && (
              <ChevronDown className={cn("size-4 shrink-0 text-muted-fg transition-transform duration-base ease-standard", expanded && "rotate-180")} aria-hidden />
            )}
            {soldOut ? (
              <Button variant="secondary" disabled onClick={(e) => e.stopPropagation()}>Full</Button>
            ) : (
              <Link to={`/app/buses/${bus.id}`} onClick={(e) => e.stopPropagation()} className={cn(buttonVariants({ variant: "accent" }))}>
                Select seats
              </Link>
            )}
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && canExpand && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-border"
          >
            <div className="space-y-3 p-5">
              {hiddenAmenities.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-fg">All amenities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bus.amenities.map((a) => <AmenityChip key={a} id={a} />)}
                  </div>
                </div>
              )}
              {bus.busPhoto ? (
                <img src={bus.busPhoto} alt={`${bus.operator} bus`} className="h-40 w-full rounded-xl border border-border object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-fg">
                  <ImageOff className="size-4" /> No bus photo yet
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

function CityInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <>
      <Input list="nepal-cities" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id="nepal-cities">
        {NEPAL_CITIES.map((c) => <option key={c} value={c} />)}
      </datalist>
    </>
  );
}