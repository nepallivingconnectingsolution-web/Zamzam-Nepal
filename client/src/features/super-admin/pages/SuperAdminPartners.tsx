

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bus, Building2, Car, Eye, Search, ShoppingBasket, Truck, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";


type PartnerType = "bus_operator" | "hotel" | "restaurant" | "grocery" | "driver" | "freight";

interface PartnerRow {
  id: string;
  type: PartnerType;
  typeLabel: string;
  name: string;
  businessName: string | null;
  businessAddress: string | null;
  email: string | null;
  mobile: string;
  kycStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  createdAt: string;
  unitsCount: number;
  unitsLabel: string;
  totalBookings: number;
  totalCustomers: number;
  totalRevenue: number;
}

interface PartnersResponse {
  items: PartnerRow[];
  summary: {
    totalPartners: number;
    busOperators: number;
    hotelPartners: number;
    restaurantPartners: number;
    groceryPartners: number;
    drivers: number;
    freightPartners: number;
    combinedBookings: number;
    combinedRevenue: number;
  };
}

const TYPE_ICON: Record<PartnerType, React.ReactNode> = {
  bus_operator: <Bus className="size-3" />,
  hotel: <Building2 className="size-3" />,
  restaurant: <UtensilsCrossed className="size-3" />,
  grocery: <ShoppingBasket className="size-3" />,
  driver: <Car className="size-3" />,
  freight: <Truck className="size-3" />,
};

const kycVariant = (s: string): "success" | "danger" | "outline" =>
  s === "APPROVED" ? "success" : s === "SUSPENDED" ? "danger" : "outline";

export function SuperAdminPartners() {
  const navigate = useNavigate();
  const { saApi } = useSuperAdminApi();
  const [search, setSearch] = useState("");

  const partners = useResource<PartnersResponse>(
    () => saApi<PartnersResponse>("/super-admin/partners"),
    [],
  );

  const filterByType = (items: PartnerRow[], type?: PartnerType) =>
    items
      .filter((p) => !type || p.type === type)
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.businessName ?? "").toLowerCase().includes(q) ||
          p.mobile.includes(q) ||
          (p.email ?? "").toLowerCase().includes(q)
        );
      });

  const items = partners.data?.items ?? [];
  const summary = partners.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partners"
        subtitle="Bus, hotel, restaurant, grocery and driver partners — bookings, customers and earnings across every business."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total partners" icon="Building2" state={partners.state} value={summary?.totalPartners ?? 0} caption="all verticals" />
        <StatCard label="Bus operators" icon="Bus" state={partners.state} value={summary?.busOperators ?? 0} caption="approved & pending" />
        <StatCard label="Hotel partners" icon="BedDouble" state={partners.state} value={summary?.hotelPartners ?? 0} caption="approved & pending" />
        <StatCard label="Restaurants" icon="UtensilsCrossed" state={partners.state} value={summary?.restaurantPartners ?? 0} caption="approved & pending" />
        <StatCard label="Grocery stores" icon="ShoppingBasket" state={partners.state} value={summary?.groceryPartners ?? 0} caption="approved & pending" />
        <StatCard label="Drivers" icon="Car" state={partners.state} value={summary?.drivers ?? 0} caption="rides · bike · taxi · parcel" />
          <StatCard label="Freight partners" icon="Truck" state={partners.state} value={summary?.freightPartners ?? 0} caption="approved & pending" />

      </div>
      <div className="grid gap-4 sm:grid-cols-1">
        <StatCard
          label="Combined revenue"
          icon="TrendingUp"
          state={partners.state}
          value={summary ? npr(summary.combinedRevenue, { compact: true }) : undefined}
          caption={summary ? `${summary.combinedBookings} confirmed bookings/orders across every vertical` : undefined}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Search partner, contact…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="px-5 pt-4">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({items.length})</TabsTrigger>
              <TabsTrigger value="bus_operator">Bus ({filterByType(items, "bus_operator").length})</TabsTrigger>
              <TabsTrigger value="hotel">Hotels ({filterByType(items, "hotel").length})</TabsTrigger>
              <TabsTrigger value="restaurant">Restaurants ({filterByType(items, "restaurant").length})</TabsTrigger>
              <TabsTrigger value="grocery">Grocery ({filterByType(items, "grocery").length})</TabsTrigger>
              <TabsTrigger value="driver">Drivers ({filterByType(items, "driver").length})</TabsTrigger>
              <TabsTrigger value="freight">Freight ({filterByType(items, "freight").length})</TabsTrigger>
            </TabsList>

            <AsyncBoundary
              state={partners.state}
              onRetry={partners.refetch}
              label="Partners"
              empty={
                <div className="py-10">
                  <EmptyState
                    icon={<Building2 className="size-6 text-muted-fg" />}
                    title="No partners yet"
                    description="Partners across every vertical will appear here once they register."
                  />
                </div>
              }
            >
              <TabsContent value="all">
                <PartnerTable rows={filterByType(items)} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
              <TabsContent value="bus_operator">
                <PartnerTable rows={filterByType(items, "bus_operator")} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
              <TabsContent value="hotel">
                <PartnerTable rows={filterByType(items, "hotel")} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
              <TabsContent value="restaurant">
                <PartnerTable rows={filterByType(items, "restaurant")} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
              <TabsContent value="grocery">
                <PartnerTable rows={filterByType(items, "grocery")} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
              <TabsContent value="driver">
                <PartnerTable rows={filterByType(items, "driver")} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
              <TabsContent value="freight">
              <PartnerTable rows={filterByType(items, "freight")} onView={(id) => navigate(`/x-admin/partners/${id}`)} />
              </TabsContent>
            </AsyncBoundary>
          </Tabs>
        </div>
      </Card>
    </div>
  );
}

function PartnerTable({ rows, onView }: { rows: PartnerRow[]; onView: (id: string) => void }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.totalRevenue - a.totalRevenue), [rows]);

  if (sorted.length === 0) {
    return (
      <div className="py-10">
        <EmptyState icon={<Search className="size-6 text-muted-fg" />} title="No matches" description="Try a different search or tab." />
      </div>
    );
  }

  return (
    
  <>
    {/* Desktop / tablet: full table */}
    <div className="hidden -mx-5 overflow-x-auto pb-5 md:block">
      <table className="w-full text-sm font-tabular">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
            <th className="px-5 py-3">Partner</th>
            <th className="px-5 py-3">Type</th>
            <th className="px-5 py-3">Contact</th>
            <th className="px-5 py-3">Units</th>
            <th className="px-5 py-3">Bookings</th>
            <th className="px-5 py-3">Customers</th>
            <th className="px-5 py-3">Revenue</th>
            <th className="px-5 py-3">KYC</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-surface-2/50">
              <td className="px-5 py-3">
                <p className="font-medium">{p.businessName || p.name}</p>
                <p className="text-xs text-muted-fg">{p.name}</p>
              </td>
              <td className="px-5 py-3">
                <Badge variant="outline" className="gap-1 text-[10px]">{TYPE_ICON[p.type]}{p.typeLabel}</Badge>
              </td>
              <td className="px-5 py-3 text-muted-fg">
                <p>{p.mobile}</p>
                {p.email && <p className="text-xs">{p.email}</p>}
              </td>
              <td className="px-5 py-3">{p.unitsCount} <span className="text-xs text-muted-fg">{p.unitsLabel}</span></td>
              <td className="px-5 py-3">{p.totalBookings}</td>
              <td className="px-5 py-3">{p.totalCustomers}</td>
              <td className="px-5 py-3 font-medium">{npr(p.totalRevenue, { compact: true })}</td>
              <td className="px-5 py-3">
                <Badge variant={kycVariant(p.kycStatus)} className="text-[10px]">{p.kycStatus}</Badge>
              </td>
              <td className="px-5 py-3">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => onView(p.id)}>
                  <Eye className="size-4" /> View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile: one card per partner instead of a cramped, horizontally-scrolling table */}
    <div className="space-y-3 pb-5 font-tabular md:hidden">
      {sorted.map((p) => (
        <div key={p.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.businessName || p.name}</p>
              <p className="truncate text-xs text-muted-fg">{p.name}</p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => onView(p.id)}>
              <Eye className="size-4" /> View
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[10px]">{TYPE_ICON[p.type]}{p.typeLabel}</Badge>
            <Badge variant={kycVariant(p.kycStatus)} className="text-[10px]">{p.kycStatus}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="col-span-2 flex items-center justify-between">
              <dt className="text-muted-fg">Contact</dt>
              <dd className="font-medium text-fg">{p.mobile}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-fg">Units</dt>
              <dd className="font-medium text-fg">{p.unitsCount} {p.unitsLabel}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-fg">Bookings</dt>
              <dd className="font-medium text-fg">{p.totalBookings}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-fg">Customers</dt>
              <dd className="font-medium text-fg">{p.totalCustomers}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-fg">Revenue</dt>
              <dd className="font-semibold text-fg">{npr(p.totalRevenue, { compact: true })}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  </>
);
}