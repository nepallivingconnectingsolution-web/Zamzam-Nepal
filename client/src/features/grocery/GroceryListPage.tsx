import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, MapPin, ReceiptText, Search, ShoppingBasket, Star, Truck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { StoreSearchResult } from "./types";

export function GroceryListPage() {
  const [city, setCity] = useState("");
  const [applied, setApplied] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (applied) params.set("city", applied);
    const qs = params.toString();
    return `${endpoints.grocery.list}${qs ? `?${qs}` : ""}`;
  }, [applied]);

  const stores = useResource<StoreSearchResult[]>(() => api.get(query), [query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grocery"
        subtitle="Daily essentials from local stores and supermarkets near you."
        actions={
          <Link to="/app/grocery/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ReceiptText className="size-4" /> My orders
          </Link>
        }
      />

      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-fg">City</span>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kathmandu, Lalitpur…" />
          </label>
          <Button variant="accent" onClick={() => setApplied(city)}>
            <Search className="size-4" /> Search
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-fg">Leave empty to browse every open store.</p>
      </Card>

      <AsyncBoundary
        state={stores.state}
        onRetry={stores.refetch}
        label="Stores"
        empty={
          <EmptyState
            icon={<ShoppingBasket className="size-6" />}
            title="No stores found"
            description="No active stores match your search yet. Try a different city."
          />
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.data?.map((s) => <StoreCard key={s.id} store={s} />)}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function StoreCard({ store: s }: { store: StoreSearchResult }) {
  return (
    <Link to={`/app/grocery/${s.id}`}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-vertical-grocery/15 to-vertical-grocery/0">
          <ShoppingBasket className="size-10 text-vertical-grocery/70" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-semibold">{s.name}</h3>
            {s.rating && (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <Star className="size-3.5 fill-warning text-warning" /> {s.rating.average.toFixed(1)}
                <span className="text-muted-fg">({s.rating.count})</span>
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
            <MapPin className="size-3.5" /> {s.city}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">{s.storeType}</Badge>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg">
              <Clock className="size-3.5" /> {s.deliveryEtaMinutes} min
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted-fg">
              <Truck className="size-3.5" /> {s.deliveryFee > 0 ? `रू ${s.deliveryFee.toLocaleString()} delivery` : "Free delivery"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              {s.fromPrice != null ? (
                <>
                  <span className="text-xs text-muted-fg">From </span>
                  <span className="font-display text-lg font-bold font-tabular">रू {s.fromPrice.toLocaleString()}</span>
                </>
              ) : (
                <Badge variant="outline" className="text-[10px]">No products listed yet</Badge>
              )}
            </div>
            <ArrowRight className="size-4 text-muted-fg" />
          </div>
        </div>
      </Card>
    </Link>
  );
}