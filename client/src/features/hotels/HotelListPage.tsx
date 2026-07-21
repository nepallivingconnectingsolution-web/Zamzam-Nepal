import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarCheck, MapPin, Search, Wifi, Coffee, Car } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { HotelSearchResult } from "./types";

const amenityIcon: Record<string, React.ReactNode> = {
  "Free WiFi": <Wifi className="size-3.5" />,
  "Breakfast included": <Coffee className="size-3.5" />,
  "Parking": <Car className="size-3.5" />,
};

export function HotelListPage() {
  const [city, setCity] = useState("");
  const [appliedCity, setAppliedCity] = useState("");

  const query = useMemo(() => {
    const qs = appliedCity ? `?city=${encodeURIComponent(appliedCity)}` : "";
    return `${endpoints.hotels.list}${qs}`;
  }, [appliedCity]);

  const hotels = useResource<HotelSearchResult[]>(() => api.get(query), [query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hotels"
        subtitle="Stays added by Zamzam hotel partners, from trek to city."
        actions={
          <Link to="/app/hotels/bookings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <CalendarCheck className="size-4" /> My bookings
          </Link>
        }
      />

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-fg">City</span>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Pokhara, Kathmandu, Chitwan…"
            />
          </label>
          <Button variant="accent" onClick={() => setAppliedCity(city)}>
            <Search className="size-4" /> Search
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-fg">
          Leave city empty to browse every active hotel added by partners.
        </p>
      </Card>

      <AsyncBoundary
        state={hotels.state}
        onRetry={hotels.refetch}
        label="Hotels"
        empty={
          <EmptyState
            icon={<BedDouble className="size-6" />}
            title="No hotels found"
            description="No active hotels match your search yet. Try a different city or clear the filter."
          />
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.data?.map((h) => (
            <HotelCard key={h.id} hotel={h} />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function HotelCard({ hotel }: { hotel: HotelSearchResult }) {
  return (
    <Link to={`/app/hotels/${hotel.id}`}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-violet-500/15 to-violet-500/0">
          <BedDouble className="size-10 text-violet-500/60" />
        </div>
        <div className="p-4">
          <h3 className="font-display text-base font-semibold">{hotel.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
            <MapPin className="size-3.5" /> {hotel.city}
          </p>
          {hotel.amenities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hotel.amenities.slice(0, 3).map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg"
                >
                  {amenityIcon[a]} {a}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div>
              {hotel.fromPrice != null ? (
                <>
                  <span className="text-xs text-muted-fg">From </span>
                  <span className="font-display text-lg font-bold">रू {hotel.fromPrice.toLocaleString()}</span>
                  <span className="text-xs text-muted-fg"> /night</span>
                </>
              ) : (
                <Badge variant="outline" className="text-[10px]">No rooms listed yet</Badge>
              )}
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-accent">
              View <ArrowRight className="size-3.5" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}