import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bike, Clock, MapPin, ReceiptText, Search, Star, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
        <div className="grid gap-4 sm:grid-cols-2">
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
    <Link to={`/app/restaurants/${r.id}`}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-vertical-restaurant/15 to-vertical-restaurant/0">
          <UtensilsCrossed className="size-10 text-vertical-restaurant/70" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-semibold">{r.name}</h3>
            {r.rating && (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <Star className="size-3.5 fill-warning text-warning" /> {r.rating.average.toFixed(1)}
                <span className="text-muted-fg">({r.rating.count})</span>
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
            <MapPin className="size-3.5" /> {r.city}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">{r.cuisine}</Badge>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg">
              <Clock className="size-3.5" /> {r.openTime}–{r.closeTime}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg">
              <Bike className="size-3.5" /> {r.deliveryFee > 0 ? `रू ${r.deliveryFee.toLocaleString()} delivery` : "Free delivery"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              {r.fromPrice != null ? (
                <>
                  <span className="text-xs text-muted-fg">From </span>
                  <span className="font-display text-lg font-bold font-tabular">रू {r.fromPrice.toLocaleString()}</span>
                </>
              ) : (
                <Badge variant="outline" className="text-[10px]">No dishes listed yet</Badge>
              )}
            </div>
            <ArrowRight className="size-4 text-muted-fg" />
          </div>
        </div>
      </Card>
    </Link>
  );
}