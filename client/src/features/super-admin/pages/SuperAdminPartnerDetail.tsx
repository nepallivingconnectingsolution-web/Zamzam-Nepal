import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Bus, Building2, Mail, MapPin, Phone, ShoppingBasket, Truck,UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";

type PartnerType = "bus_operator" | "hotel" | "restaurant" | "grocery" | "freight";

interface PartnerHeader {
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
}

interface BookingRow {
  id: string;
  bookingRef: string;
  description: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string | null;
  amount: number;
  status: string;
  bookedAt: string;
}

interface PartnerDetailResponse {
  partner: PartnerHeader;
  stats: { totalBookings: number; totalCustomers: number; totalRevenue: number };
  bookings: BookingRow[];
}

const TYPE_ICON: Record<PartnerType, React.ReactNode> = {
  bus_operator: <Bus className="size-3.5" />,
  hotel: <Building2 className="size-3.5" />,
  restaurant: <UtensilsCrossed className="size-3.5" />,
  grocery: <ShoppingBasket className="size-3.5" />,
  freight: <Truck className="size-3.5" />,
};

const kycVariant = (s: string): "success" | "danger" | "outline" =>
  s === "APPROVED" ? "success" : s === "SUSPENDED" ? "danger" : "outline";

const bookingStatusVariant = (s: string): "success" | "danger" | "warning" | "outline" => {
  if (s === "CONFIRMED" || s === "COMPLETED" || s === "DELIVERED") return "success";
  if (s === "CANCELLED") return "danger";
  if (s === "PENDING") return "warning";
  return "outline";
};

export function SuperAdminPartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const { saApi } = useSuperAdminApi();

  const detail = useResource<PartnerDetailResponse>(
    () => saApi<PartnerDetailResponse>(`/super-admin/partners/${id}`),
    [id],
  );

  const p = detail.data?.partner;
  const s = detail.data?.stats;

  return (
    <div className="space-y-6">
      <Link to="/x-admin/partners" className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg">
        <ArrowLeft className="size-4" /> Back to partners
      </Link>

      <AsyncBoundary
        state={detail.state}
        onRetry={detail.refetch}
        label="Partner"
        empty={
          <EmptyState
            icon={<Building2 className="size-6 text-muted-fg" />}
            title="Partner not found"
            description="This partner may have been removed."
          />
        }
      >
        {p && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                  {p.businessName || p.name}
                </h1>
                <p className="mt-1 text-sm text-muted-fg">
                  {p.name} · {p.unitsCount} {p.unitsLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  {TYPE_ICON[p.type]}
                  {p.typeLabel}
                </Badge>
                <Badge variant={kycVariant(p.kycStatus)}>{p.kycStatus}</Badge>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Contact & business details</CardTitle>
              </CardHeader>
              <div className="grid gap-3 px-5 pb-5 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-fg" />
                  <span>{p.mobile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-fg" />
                  <span>{p.email ?? <span className="text-muted-fg">Not provided</span>}</span>
                </div>
                {p.businessAddress && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <MapPin className="size-4 text-muted-fg" />
                    <span>{p.businessAddress}</span>
                  </div>
                )}
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Confirmed bookings" icon="Ticket" state={detail.state} value={s?.totalBookings ?? 0} caption="lifetime" />
              <StatCard label="Unique customers" icon="Users" state={detail.state} value={s?.totalCustomers ?? 0} caption="served" />
              <StatCard label="Total earnings" icon="TrendingUp" state={detail.state} value={s ? npr(s.totalRevenue, { compact: true }) : undefined} caption="confirmed revenue" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Bookings & customers</CardTitle>
                <CardDescription>Most recent 200 bookings for this partner, newest first.</CardDescription>
              </CardHeader>
              {(detail.data?.bookings.length ?? 0) === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState
                    icon={<Building2 className="size-6 text-muted-fg" />}
                    title="No bookings yet"
                    description="Bookings will appear here as customers book with this partner."
                  />
                </div>
              ) : (
                <>
  {/* Desktop / tablet: full table */}
  <div className="hidden overflow-x-auto px-5 pb-5 md:block">
    <table className="w-full min-w-[720px] text-sm font-tabular">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-fg">
          <th className="py-2 pr-3 font-medium">Booking</th>
          <th className="py-2 pr-3 font-medium">Customer</th>
          <th className="py-2 pr-3 font-medium">Details</th>
          <th className="py-2 pr-3 font-medium">Amount</th>
          <th className="py-2 pr-3 font-medium">Status</th>
          <th className="py-2 font-medium">Booked</th>
        </tr>
      </thead>
      <tbody>
        {detail.data?.bookings.map((b) => (
          <tr key={b.id} className="border-b border-border/60 last:border-0">
            <td className="py-2 pr-3 font-medium">{b.bookingRef}</td>
            <td className="py-2 pr-3">
              <p>{b.customerName}</p>
              <p className="text-xs text-muted-fg">{b.customerMobile}</p>
            </td>
            <td className="py-2 pr-3 text-muted-fg">{b.description}</td>
            <td className="py-2 pr-3 font-medium">{npr(b.amount, { compact: true })}</td>
            <td className="py-2 pr-3">
              <Badge variant={bookingStatusVariant(b.status)} className="text-[10px]">
                {b.status}
              </Badge>
            </td>
            <td className="py-2 text-xs text-muted-fg">
              {new Date(b.bookedAt).toLocaleString("en-NP")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* Mobile: one card per booking instead of a cramped, horizontally-scrolling table */}
  <div className="space-y-3 px-5 pb-5 font-tabular md:hidden">
    {detail.data?.bookings.map((b) => (
      <div key={b.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{b.bookingRef}</p>
            <p className="truncate text-xs text-muted-fg">{b.customerName} · {b.customerMobile}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-fg">
            {npr(b.amount, { compact: true })}
          </span>
        </div>
        <p className="mt-1.5 truncate text-xs text-muted-fg">{b.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={bookingStatusVariant(b.status)} className="text-[10px]">
            {b.status}
          </Badge>
          <span className="text-xs text-muted-fg">
            {new Date(b.bookedAt).toLocaleString("en-NP")}
            </span>
            </div>
            </div>
             ))}
             </div>
              </>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}