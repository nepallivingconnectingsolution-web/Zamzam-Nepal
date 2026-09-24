import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, CalendarCheck, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { ListingCard } from "@/components/shared/listing-card";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { HotelSearchResult } from "./types";

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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
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
    <ListingCard
      to={`/app/hotels/${hotel.id}`}
      photo={hotel.photos[0] ?? null}
      fallbackIcon={<BedDouble className="size-10 text-vertical-hotel/70" />}
      fallbackClassName="from-vertical-hotel/15 to-vertical-hotel/0"
      title={hotel.name}
      location={hotel.city}
      meta={hotel.amenities.slice(0, 3)}
      price={hotel.fromPrice}
      priceUnit="/night"
      emptyPriceLabel="No rooms listed yet"
    />
  );
}