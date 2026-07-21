import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bus, BedDouble, CalendarX, ChevronRight, ShoppingBasket, Truck, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";

type Vertical = "bus" | "hotel" | "food" | "grocery" | "freight";

interface UnifiedBooking {
  id: string;
  vertical: Vertical;
  title: string;
  subtitle: string;
  ref: string | null;
  status: string;
  amount: number | null;
  date: string;
  href: string;
}

const VERTICAL_META: Record<Vertical, { label: string; icon: typeof Bus }> = {
  bus: { label: "Bus", icon: Bus },
  hotel: { label: "Hotel", icon: BedDouble },
  food: { label: "Food", icon: UtensilsCrossed },
  grocery: { label: "Grocery", icon: ShoppingBasket },
  freight: { label: "Freight", icon: Truck },
};

const FILTERS: { id: Vertical | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bus", label: "Buses" },
  { id: "hotel", label: "Hotels" },
  { id: "food", label: "Food" },
  { id: "grocery", label: "Grocery" },
  { id: "freight", label: "Freight" },
];

/** Green for good outcomes, red for cancelled/failed, neutral otherwise. */
function statusVariant(status: string): "success" | "danger" | "outline" {
  if (["CONFIRMED", "COMPLETED", "DELIVERED", "ASSIGNED"].includes(status)) return "success";
  if (["CANCELLED", "FAILED", "REJECTED", "EXPIRED"].includes(status)) return "danger";
  return "outline";
}

/**
 * Unified bookings across every vertical — backed by GET /bookings, which
 * merges bus tickets, hotel stays, food & grocery orders and freight loads
 * into one normalized, newest-first list.
 */
export function BookingsPage() {
  const bookings = useResource<UnifiedBooking[]>(() => api.get(endpoints.bookings.list));
  const [filter, setFilter] = useState<Vertical | "all">("all");

  const rows = useMemo(() => {
    const all = bookings.data ?? [];
    return filter === "all" ? all : all.filter((b) => b.vertical === filter);
  }, [bookings.data, filter]);

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" subtitle="Everything you've booked — buses, hotels, food, grocery and freight." />

      <Card className="p-2">
        <div className="flex flex-wrap gap-2 border-b border-border px-3 py-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-fg hover:border-accent/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <AsyncBoundary
          state={bookings.state}
          onRetry={bookings.refetch}
          label="Your bookings"
          empty={
            <EmptyState
              icon={<CalendarX className="size-6 text-muted-fg" />}
              title="No bookings yet"
              description="Book a bus, hotel, meal, grocery run or freight load and it will show up here."
            />
          }
        >
          {rows.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<CalendarX className="size-6 text-muted-fg" />}
                title="Nothing in this category"
                description="Try a different filter to see the rest of your bookings."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((b) => {
                const meta = VERTICAL_META[b.vertical];
                const Icon = meta.icon;
                return (
                  <li key={`${b.vertical}-${b.id}`}>
                    <Link
                      to={b.href}
                      className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2/50"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-fg">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{b.title}</p>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-fg">{b.subtitle}</p>
                        <p className="text-[11px] text-muted-fg">
                          {b.ref ? `${b.ref} · ` : ""}
                          {new Date(b.date).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          {b.amount != null && <p className="text-sm font-semibold">{npr(b.amount)}</p>}
                          <Badge variant={statusVariant(b.status)} className="text-[10px]">
                            {b.status.toLowerCase().replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <ChevronRight className="size-4 text-muted-fg" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </AsyncBoundary>
      </Card>
    </div>
  );
}