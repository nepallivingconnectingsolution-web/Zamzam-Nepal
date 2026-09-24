import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ReceiptText, Search, ShoppingBasket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { ListingCard } from "@/components/shared/listing-card";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {stores.data?.map((s) => <StoreCard key={s.id} store={s} />)}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function StoreCard({ store: s }: { store: StoreSearchResult }) {
  return (
    <ListingCard
      to={`/app/grocery/${s.id}`}
      photo={s.photos[0] ?? null}
      fallbackIcon={<ShoppingBasket className="size-10 text-vertical-grocery/70" />}
      fallbackClassName="from-vertical-grocery/15 to-vertical-grocery/0"
      title={s.name}
      location={s.city}
      rating={s.rating}
      meta={[s.storeType, `${s.deliveryEtaMinutes} min`, s.deliveryFee > 0 ? `रू ${s.deliveryFee.toLocaleString()} delivery` : "Free delivery"]}
      price={s.fromPrice}
      emptyPriceLabel="No products listed yet"
    />
  );
}