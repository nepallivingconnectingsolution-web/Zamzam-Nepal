import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ReceiptText, Search, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { ListingCard } from "@/components/shared/listing-card";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { RestaurantSearchResult } from "./types";

export function RestaurantListPage() {
  const [city, setCity] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [applied, setApplied] = useState({ city: "", cuisine: "" });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.city) params.set("city", applied.city);
    if (applied.cuisine) params.set("cuisine", applied.cuisine);
    const qs = params.toString();
    return `${endpoints.restaurants.list}${qs ? `?${qs}` : ""}`;
  }, [applied]);

  const restaurants = useResource<RestaurantSearchResult[]>(() => api.get(query), [query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food"
        subtitle="Order from local kitchens added by Zamzam restaurant partners."
        actions={
          <Link to="/app/restaurants/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ReceiptText className="size-4" /> My orders
          </Link>
        }
      />

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-fg">City</span>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kathmandu, Pokhara…" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-fg">Cuisine</span>
            <Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Momo, Newari, Italian…" />
          </label>
          <Button variant="accent" onClick={() => setApplied({ city, cuisine })}>
            <Search className="size-4" /> Search
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-fg">Leave both empty to browse every open restaurant.</p>
      </Card>

      <AsyncBoundary
        state={restaurants.state}
        onRetry={restaurants.refetch}
        label="Restaurants"
        empty={
          <EmptyState
            icon={<UtensilsCrossed className="size-6" />}
            title="No restaurants found"
            description="No active restaurants match your search yet. Try a different city or cuisine."
          />
        }
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {restaurants.data?.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function RestaurantCard({ restaurant: r }: { restaurant: RestaurantSearchResult }) {
  return (
    <ListingCard
      to={`/app/restaurants/${r.id}`}
      photo={r.photos[0] ?? null}
      fallbackIcon={<UtensilsCrossed className="size-10 text-vertical-restaurant/70" />}
      fallbackClassName="from-vertical-restaurant/15 to-vertical-restaurant/0"
      title={r.name}
      location={r.city}
      rating={r.rating}
      meta={[r.cuisine, `${r.openTime}–${r.closeTime}`, r.deliveryFee > 0 ? `रू ${r.deliveryFee.toLocaleString()} delivery` : "Free delivery"]}
      price={r.fromPrice}
      emptyPriceLabel="No dishes listed yet"
    />
  );
}