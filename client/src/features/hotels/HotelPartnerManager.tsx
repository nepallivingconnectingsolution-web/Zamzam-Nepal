import { useState } from "react";
import {
  BedDouble,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  Ticket,
  Trash2,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/time-field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { HotelBooking, HotelBookingDetail, PartnerHotel, PartnerRoomType } from "./types";
import { COMMON_HOTEL_AMENITIES } from "./types";

type Tab = "properties" | "bookings";

export function HotelPartnerManager({
  title = "Hotels",
  subtitle = "List your properties, manage rooms and track bookings.",
  initialTab = "properties",
}: {
  title?: string;
  subtitle?: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === "properties"} onClick={() => setTab("properties")} icon={<Building2 className="size-4" />} label="Properties" />
        <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")} icon={<Ticket className="size-4" />} label="Bookings" />
      </div>
      {tab === "properties" && <PropertiesTab />}
      {tab === "bookings" && <BookingsTab />}
    </div>
  );
}

function PropertiesTab() {
  const hotels = useResource<PartnerHotel[]>(() => api.get(endpoints.hotels.partner.hotels), []);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="accent" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close form" : "Add hotel"}
        </Button>
      </div>
      {open && <AddHotelForm onAdded={() => { setOpen(false); hotels.refetch(); }} />}
      <AsyncBoundary state={hotels.state} onRetry={hotels.refetch} label="Your hotels"
        empty={<EmptyState icon={<Building2 className="size-6" />} title="No hotels yet" description="Add your first hotel, then add room types so customers can book." />}
      >
        <div className="space-y-3">
          {hotels.data?.map((h) => (
            <Card key={h.id} className="overflow-hidden">
              <button type="button" onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <div>
                  <h3 className="font-display text-base font-semibold">{h.name}</h3>
                  <p className="text-sm text-muted-fg">{h.address}, {h.city}</p>
                  <p className="mt-0.5 text-xs text-muted-fg">Check-in {h.checkInTime} • Check-out {h.checkOutTime}</p>
                </div>
                {expandedId === h.id ? <ChevronUp className="size-4 text-muted-fg" /> : <ChevronDown className="size-4 text-muted-fg" />}
              </button>
              {expandedId === h.id && (
                <div className="border-t border-border p-5">
                  <RoomTypesPanel hotelId={h.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function AddHotelForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [checkInTime, setCheckInTime] = useState("12:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAmenity(a: string) {
    setAmenities((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }

  async function submit() {
    if (!name.trim() || !city.trim() || !address.trim()) {
      setError("Hotel name, city, and address are required."); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post(endpoints.hotels.partner.hotels, { name, city, address, description, amenities, checkInTime, checkOutTime });
      toast.success("Hotel added", "Now add room types so customers can book.");
      onAdded();
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't add hotel.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-3 font-display text-sm font-semibold">Add a hotel</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Hotel name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input className="sm:col-span-2" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input className="sm:col-span-2" placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <TimeField label="Check-in time" value={checkInTime} onChange={setCheckInTime} />
        <TimeField label="Check-out time" value={checkOutTime} onChange={setCheckOutTime} />
      </div>
      <p className="mb-2 mt-4 text-xs font-medium text-muted-fg">Amenities</p>
      <div className="flex flex-wrap gap-2">
        {COMMON_HOTEL_AMENITIES.map((a) => (
          <button key={a} type="button" onClick={() => toggleAmenity(a)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              amenities.includes(a) ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border text-muted-fg hover:bg-surface-2"
            )}
          >{a}</button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <Button variant="accent" className="mt-4" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add hotel"}
      </Button>
    </Card>
  );
}

function RoomTypesPanel({ hotelId }: { hotelId: string }) {
  const rooms = useResource<PartnerRoomType[]>(() => api.get(endpoints.hotels.partner.roomTypes(hotelId)), [hotelId]);
  const [open, setOpen] = useState(false);

  async function remove(roomTypeId: string) {
    try {
      await api.delete(endpoints.hotels.partner.roomType(hotelId, roomTypeId));
      toast.success("Room type removed");
      rooms.refetch();
    } catch { toast.error("Couldn't remove room type"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold">Room types</h4>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close" : "Add room type"}
        </Button>
      </div>
      {open && <AddRoomTypeForm hotelId={hotelId} onAdded={() => { setOpen(false); rooms.refetch(); }} />}
      <AsyncBoundary state={rooms.state} onRetry={rooms.refetch} label="Room types"
        empty={<EmptyState icon={<BedDouble className="size-5" />} title="No room types yet" description="Add a room type so customers can book this hotel." />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {rooms.data?.map((r) => (
            <div key={r.id} className="flex items-start justify-between rounded-xl border border-border p-3.5">
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-fg">
                  रू {r.pricePerNight.toLocaleString()}/night • {r.totalRooms} room(s) • up to {r.maxGuests} guests
                </p>
              </div>
              <button type="button" onClick={() => remove(r.id)} className="text-muted-fg hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function AddRoomTypeForm({ hotelId, onAdded }: { hotelId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricePerNight, setPricePerNight] = useState("");
  const [totalRooms, setTotalRooms] = useState("");
  const [maxGuests, setMaxGuests] = useState("2");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const price = Number(pricePerNight);
    const rooms = Number(totalRooms);
    const guests = Number(maxGuests);
    if (!name.trim() || !price || price <= 0 || !rooms || rooms <= 0) {
      setError("Room name, a positive price, and room count are required."); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post(endpoints.hotels.partner.roomTypes(hotelId), { name, description, pricePerNight: price, totalRooms: rooms, maxGuests: guests || 2 });
      toast.success("Room type added");
      onAdded();
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't add room type.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card className="bg-surface-2/60 p-4">
      <div className="grid gap-2.5 sm:grid-cols-4">
        <Input placeholder="Room name (e.g. Deluxe)" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <Input placeholder="Price/night" type="number" value={pricePerNight} onChange={(e) => setPricePerNight(e.target.value)} />
        <Input placeholder="Total rooms" type="number" value={totalRooms} onChange={(e) => setTotalRooms(e.target.value)} />
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-4">
        <Input placeholder="Max guests" type="number" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} className="w-40" />
        <Input
          placeholder="Room description (optional) — bed type, size, view…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="sm:col-span-3"
        />
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add room type"}
      </Button>
    </Card>
  );
}

function BookingsTab() {
  const bookings = useResource<HotelBooking[]>(() => api.get(endpoints.hotels.partner.bookings), []);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function cancel(bookingId: string) {
    setCancellingId(bookingId);
    try {
      await api.post(endpoints.hotels.partner.cancelBooking(bookingId));
      toast.success("Booking cancelled", "The room is now free for those dates and the guest has been refunded.");
      bookings.refetch();
    } catch (e) {
      toast.error((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't cancel booking.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <AsyncBoundary state={bookings.state} onRetry={bookings.refetch} label="Bookings"
      empty={<EmptyState icon={<Ticket className="size-6" />} title="No bookings yet" description="Bookings from customers will show up here." />}
    >
      <div className="space-y-3">
        {bookings.data?.map((b) => {
          const expanded = expandedId === b.id;
          return (
            <Card key={b.id} className="overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : b.id)}
                className="flex w-full flex-col gap-3 p-5 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold">{b.guestName}</h3>
                    <Badge variant={b.status === "CONFIRMED" ? "success" : "danger"}>{b.status.toLowerCase()}</Badge>
                    <span className="text-xs text-muted-fg">{b.bookingRef}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-fg">
                    {b.hotel.roomTypeName} • {b.checkIn} → {b.checkOut} ({b.nights} night{b.nights === 1 ? "" : "s"}) • {b.roomCount} room(s) • {b.guests} guest(s)
                  </p>
                  <p className="mt-1 text-xs text-muted-fg">{b.guestPhone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-display text-lg font-bold">रू {b.grandTotal.toLocaleString()}</p>
                  {b.status === "CONFIRMED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancellingId === b.id}
                      onClick={(e) => { e.stopPropagation(); cancel(b.id); }}
                    >
                      {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  )}
                  {expanded ? <ChevronUp className="size-4 text-muted-fg" /> : <ChevronDown className="size-4 text-muted-fg" />}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-border p-5">
                  <BookingDetailPanel bookingId={b.id} fallback={b} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AsyncBoundary>
  );
}

/** Full booking + guest details, fetched on expand so the list view stays light. */
function BookingDetailPanel({ bookingId, fallback }: { bookingId: string; fallback: HotelBooking }) {
  const detail = useResource<HotelBookingDetail>(() => api.get(endpoints.hotels.partner.bookingDetail(bookingId)), [bookingId]);
  const b = detail.data ?? fallback;

  return (
    <AsyncBoundary state={detail.state} onRetry={detail.refetch} label="Booking details">
      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
            <User className="size-3.5" /> Guest details
          </h4>
          <dl className="space-y-1.5 text-sm">
            <Row label="Staying guest" value={b.guestName} />
            <Row label="Guest phone" value={b.guestPhone} icon={<Phone className="size-3.5" />} />
            <Row label="Guests" value={String(b.guests)} />
          </dl>
          {b.account && (
            <>
              <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
                <ShieldCheck className="size-3.5" /> Booked by (account)
              </h4>
              <dl className="space-y-1.5 text-sm">
                <Row label="Name" value={b.account.name} />
                <Row label="Email" value={b.account.email} icon={<Mail className="size-3.5" />} />
                <Row label="Mobile" value={b.account.mobile} icon={<Phone className="size-3.5" />} />
                <Row label="KYC status" value={b.account.kycStatus} />
              </dl>
            </>
          )}
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
            <Calendar className="size-3.5" /> Booking details
          </h4>
          <dl className="space-y-1.5 text-sm">
            <Row label="Booking ref" value={b.bookingRef} />
            <Row label="Status" value={b.status} />
            <Row label="Hotel" value={b.hotel.hotelName} />
            <Row label="Room type" value={b.hotel.roomTypeName} />
            <Row label="Rooms booked" value={String(b.roomCount)} />
            <Row label="Check-in" value={b.checkIn} />
            <Row label="Check-out" value={b.checkOut} />
            <Row label="Nights" value={String(b.nights)} />
            <Row label="Payment method" value={b.method ?? "—"} />
            <Row label="Booked at" value={new Date(b.bookedAt).toLocaleString()} />
          </dl>

          <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-fg">Price breakdown</h4>
          <dl className="space-y-1.5 text-sm">
            <Row label="Price / night" value={`रू ${b.pricePerNight.toLocaleString()}`} />
            <Row label="Room total" value={`रू ${b.totalPrice.toLocaleString()}`} />
            <Row label="Service fee" value={`रू ${b.serviceFee.toLocaleString()}`} />
            <Row label="Grand total" value={`रू ${b.grandTotal.toLocaleString()}`} strong />
          </dl>
        </section>
      </div>
    </AsyncBoundary>
  );
}

function Row({ label, value, icon, strong }: { label: string; value: string; icon?: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted-fg">{icon}{label}</dt>
      <dd className={cn("text-right", strong && "font-display font-bold")}>{value}</dd>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-fg hover:text-fg"
      )}
    >
      {icon} {label}
    </button>
  );
}