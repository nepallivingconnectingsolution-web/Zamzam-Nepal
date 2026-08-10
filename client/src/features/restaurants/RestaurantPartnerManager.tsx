import { useEffect, useState } from "react";
import {
  ChevronDown, ChevronUp, ClipboardList, Flame, Leaf, ListPlus,
  Mail, Phone, Plus, ShieldCheck, Store, Trash2, User, UtensilsCrossed,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/time-field";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import {
  NEXT_STATUS, STATUS_LABEL,
  type FoodOrder, type PartnerMenuCategory, type PartnerMenuItem, type PartnerRestaurant,
} from "./types";

type Tab = "restaurants" | "orders";
const ORDER_POLL_MS = 15_000;

export function RestaurantPartnerManager({
  title = "Restaurants",
  subtitle = "Manage your restaurants, menus and live orders.",
  initialTab = "restaurants",
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
        <TabButton active={tab === "restaurants"} onClick={() => setTab("restaurants")} icon={<Store className="size-4" />} label="Restaurants & menu" />
        <TabButton active={tab === "orders"} onClick={() => setTab("orders")} icon={<ClipboardList className="size-4" />} label="Orders" />
      </div>
      {tab === "restaurants" && <RestaurantsTab />}
      {tab === "orders" && <OrdersTab />}
    </div>
  );
}

/* ───────────────────────────── Restaurants & menu ───────────────────────── */

function RestaurantsTab() {
  const restaurants = useResource<PartnerRestaurant[]>(() => api.get(endpoints.restaurants.partner.restaurants), []);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="accent" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close form" : "Add restaurant"}
        </Button>
      </div>
      {open && <AddRestaurantForm onAdded={() => { setOpen(false); restaurants.refetch(); }} />}
      <AsyncBoundary state={restaurants.state} onRetry={restaurants.refetch} label="Your restaurants"
        empty={<EmptyState icon={<Store className="size-6" />} title="No restaurants yet" description="Add your first restaurant, then add categories and dishes so customers can order." />}
      >
        <div className="space-y-3">
          {restaurants.data?.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <button type="button" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <div>
                  <h3 className="font-display text-base font-semibold">{r.name}</h3>
                  <p className="text-sm text-muted-fg">{r.address}, {r.city} • {r.cuisine}</p>
                  <p className="mt-0.5 text-xs text-muted-fg">
                    Open {r.openTime}–{r.closeTime} • Delivery रू {r.deliveryFee.toLocaleString()} • Min order रू {r.minOrder.toLocaleString()}
                  </p>
                </div>
                {expandedId === r.id ? <ChevronUp className="size-4 text-muted-fg" /> : <ChevronDown className="size-4 text-muted-fg" />}
              </button>
              {expandedId === r.id && (
                <div className="space-y-6 border-t border-border p-5">
                  <CategoriesPanel restaurantId={r.id} />
                  <MenuItemsPanel restaurantId={r.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function AddRestaurantForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [cuisine, setCuisine] = useState("Nepali");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("21:00");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !city.trim() || !address.trim()) {
      setError("Restaurant name, city, and address are required."); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post(endpoints.restaurants.partner.restaurants, {
        name, city, address, description, cuisine, openTime, closeTime,
        deliveryFee: Number(deliveryFee) || 0, minOrder: Number(minOrder) || 0,
      });
      toast.success("Restaurant added", "Now add menu categories and dishes so customers can order.");
      onAdded();
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't add restaurant.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-3 font-display text-sm font-semibold">Add a restaurant</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Restaurant name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input className="sm:col-span-2" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input className="sm:col-span-2" placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input placeholder="Cuisine (e.g. Newari, Momo)" value={cuisine} onChange={(e) => setCuisine(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Opens" value={openTime} onChange={setOpenTime} />
          <TimeField label="Closes" value={closeTime} onChange={setCloseTime} />
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-fg">
          Delivery fee (रू)
          <Input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-fg">
          Minimum order (रू)
          <Input type="number" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <Button variant="accent" className="mt-4" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add restaurant"}
      </Button>
    </Card>
  );
}

function CategoriesPanel({ restaurantId }: { restaurantId: string }) {
  const categories = useResource<PartnerMenuCategory[]>(
    () => api.get(endpoints.restaurants.partner.categories(restaurantId)), [restaurantId],
  );
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.post(endpoints.restaurants.partner.categories(restaurantId), { name });
      setName("");
      toast.success("Category added");
      categories.refetch();
    } catch { toast.error("Couldn't add category"); }
    finally { setSubmitting(false); }
  }

  async function remove(categoryId: string) {
    try {
      await api.delete(endpoints.restaurants.partner.category(restaurantId, categoryId));
      toast.success("Category removed", "Its dishes moved to the general menu.");
      categories.refetch();
    } catch { toast.error("Couldn't remove category"); }
  }

  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-1.5 font-display text-sm font-semibold">
        <ListPlus className="size-4" /> Menu categories
      </h4>
      <div className="flex gap-2">
        <Input placeholder="e.g. Momo, Drinks, Dessert" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button variant="outline" size="sm" disabled={submitting} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <AsyncBoundary state={categories.state} onRetry={categories.refetch} label="Categories"
        empty={<p className="text-xs text-muted-fg">No categories yet — dishes without a category appear under "Menu".</p>}
      >
        <div className="flex flex-wrap gap-2">
          {categories.data?.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium">
              {c.name}
              <button type="button" onClick={() => remove(c.id)} className="text-muted-fg hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function MenuItemsPanel({ restaurantId }: { restaurantId: string }) {
  const items = useResource<PartnerMenuItem[]>(
    () => api.get(endpoints.restaurants.partner.items(restaurantId)), [restaurantId],
  );
  const categories = useResource<PartnerMenuCategory[]>(
    () => api.get(endpoints.restaurants.partner.categories(restaurantId)), [restaurantId],
  );
  const [open, setOpen] = useState(false);

  async function remove(itemId: string) {
    try {
      await api.delete(endpoints.restaurants.partner.item(restaurantId, itemId));
      toast.success("Dish removed");
      items.refetch();
    } catch { toast.error("Couldn't remove dish"); }
  }

  async function toggleAvailability(item: PartnerMenuItem) {
    try {
      await api.patch(endpoints.restaurants.partner.item(restaurantId, item.id), {
        name: item.name, description: item.description ?? undefined, categoryId: item.categoryId ?? undefined,
        price: item.price, isVeg: item.isVeg, spiceLevel: item.spiceLevel, prepTimeMin: item.prepTimeMin,
        tags: item.tags, isAvailable: !item.isAvailable,
      });
      items.refetch();
    } catch { toast.error("Couldn't update dish"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-display text-sm font-semibold">
          <UtensilsCrossed className="size-4" /> Dishes
        </h4>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close" : "Add dish"}
        </Button>
      </div>
      {open && (
        <AddMenuItemForm
          restaurantId={restaurantId}
          categories={categories.data ?? []}
          onAdded={() => { setOpen(false); items.refetch(); }}
        />
      )}
      <AsyncBoundary state={items.state} onRetry={items.refetch} label="Dishes"
        empty={<EmptyState icon={<UtensilsCrossed className="size-5" />} title="No dishes yet" description="Add a dish so customers can order from this restaurant." />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items.data?.map((i) => (
            <div key={i.id} className="flex items-start justify-between rounded-xl border border-border p-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium">{i.name}</p>
                  {i.isVeg && <Badge variant="success" className="gap-1 text-[10px]"><Leaf className="size-3" /> Veg</Badge>}
                  {i.spiceLevel > 0 && (
                    <span className="inline-flex items-center text-warning">
                      {Array.from({ length: i.spiceLevel }).map((_, n) => <Flame key={n} className="size-3" />)}
                    </span>
                  )}
                  {!i.isAvailable && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                </div>
                <p className="text-xs text-muted-fg">रू {i.price.toLocaleString()} • ~{i.prepTimeMin} min</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleAvailability(i)}>
                  {i.isAvailable ? "Hide" : "Show"}
                </Button>
                <button type="button" onClick={() => remove(i.id)} className="text-muted-fg hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function AddMenuItemForm({
  restaurantId, categories, onAdded,
}: { restaurantId: string; categories: PartnerMenuCategory[]; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [prepTimeMin, setPrepTimeMin] = useState("20");
  const [isVeg, setIsVeg] = useState(false);
  const [spiceLevel, setSpiceLevel] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const p = Number(price);
    if (!name.trim() || !p || p <= 0) {
      setError("A dish name and a positive price are required."); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post(endpoints.restaurants.partner.items(restaurantId), {
        name, description: description || undefined, price: p,
        categoryId: categoryId || undefined,
        prepTimeMin: Number(prepTimeMin) || 20, isVeg, spiceLevel,
      });
      toast.success("Dish added");
      onAdded();
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't add dish.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card className="bg-surface-2/60 p-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Input placeholder="Dish name (e.g. Chicken Momo)" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <Input placeholder="Price (रू)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="Prep min" type="number" value={prepTimeMin} onChange={(e) => setPrepTimeMin(e.target.value)} />
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <SelectField
          value={categoryId}
          onChange={setCategoryId}
          placeholder="No category"
          options={[{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="sm:col-span-3" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => setIsVeg((v) => !v)}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            isVeg ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border text-muted-fg hover:bg-surface-2")}
        >
          <Leaf className="size-3.5" /> Vegetarian
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-fg">Spice</span>
          {[0, 1, 2, 3].map((s) => (
            <button key={s} type="button" onClick={() => setSpiceLevel(s)}
              className={cn("rounded-md border px-2 py-0.5 text-xs",
                spiceLevel === s ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border text-muted-fg")}
            >
              {s === 0 ? "None" : "🌶".repeat(s)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add dish"}
      </Button>
    </Card>
  );
}

/* ───────────────────────────── Orders (kitchen board) ────────────────────── */

function OrdersTab() {
  const orders = useResource<FoodOrder[]>(() => api.get(endpoints.restaurants.partner.orders), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Live board: poll every 15s so new orders and status changes appear
  // without a manual refresh. Same polling cadence as the customer view.
  useEffect(() => {
    const t = setInterval(() => orders.refetch(), ORDER_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setStatus(order: FoodOrder, status: FoodOrder["status"]) {
    setBusyId(order.id);
    try {
      await api.post(endpoints.restaurants.partner.orderStatus(order.id), { status });
      toast.success(`Order ${order.orderRef}`, `Marked ${STATUS_LABEL[status].toLowerCase()}.`);
      orders.refetch();
    } catch (e) {
      toast.error((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't update the order.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AsyncBoundary state={orders.state} onRetry={orders.refetch} label="Orders"
      empty={<EmptyState icon={<ClipboardList className="size-6" />} title="No orders yet" description="Incoming customer orders will show up here live." />}
    >
      <div className="space-y-3">
        {orders.data?.map((o) => {
          const expanded = expandedId === o.id;
          const next = NEXT_STATUS[o.status]?.[o.fulfillment];
          const canReject = o.status === "PENDING" || o.status === "ACCEPTED";
          return (
            <Card key={o.id} className="overflow-hidden p-0">
              <button type="button" onClick={() => setExpandedId(expanded ? null : o.id)}
                className="flex w-full flex-col gap-3 p-5 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold">{o.customerName}</h3>
                    <StatusBadge status={o.status} />
                    <span className="text-xs text-muted-fg">{o.orderRef}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-fg">
                    {o.restaurant.restaurantName} • {o.items.reduce((s, i) => s + i.quantity, 0)} item(s) • {o.fulfillment === "delivery" ? "Delivery" : "Pickup"} • {new Date(o.placedAt).toLocaleTimeString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-fg">{o.customerPhone}</p>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <p className="font-display text-lg font-bold">रू {o.grandTotal.toLocaleString()}</p>
                  {next && (
                    <Button variant="accent" size="sm" disabled={busyId === o.id} onClick={() => setStatus(o, next)}>
                      {busyId === o.id ? "Updating…" : `Mark ${STATUS_LABEL[next].toLowerCase()}`}
                    </Button>
                  )}
                  {canReject && (
                    <Button variant="outline" size="sm" disabled={busyId === o.id} onClick={() => setStatus(o, "CANCELLED")}>
                      Reject
                    </Button>
                  )}
                  {expanded ? <ChevronUp className="size-4 text-muted-fg" /> : <ChevronDown className="size-4 text-muted-fg" />}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-border p-5">
                  <OrderDetailPanel order={o} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AsyncBoundary>
  );
}

function OrderDetailPanel({ order: o }: { order: FoodOrder }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
          <User className="size-3.5" /> Customer
        </h4>
        <dl className="space-y-1.5 text-sm">
          <Row label="Name" value={o.customerName} />
          <Row label="Phone" value={o.customerPhone} icon={<Phone className="size-3.5" />} />
          {o.deliveryAddress && <Row label="Address" value={o.deliveryAddress} />}
          {o.note && <Row label="Note" value={o.note} />}
        </dl>
        {o.account && (
          <>
            <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
              <ShieldCheck className="size-3.5" /> Ordered by (account)
            </h4>
            <dl className="space-y-1.5 text-sm">
              <Row label="Name" value={o.account.name} />
              <Row label="Email" value={o.account.email} icon={<Mail className="size-3.5" />} />
              <Row label="Mobile" value={o.account.mobile} icon={<Phone className="size-3.5" />} />
              <Row label="KYC status" value={o.account.kycStatus} />
            </dl>
          </>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-fg">Items</h4>
        <dl className="space-y-1.5 text-sm">
          {o.items.map((i) => (
            <Row key={i.id} label={`${i.quantity} × ${i.name}`} value={`रू ${i.lineTotal.toLocaleString()}`} />
          ))}
        </dl>
        <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-fg">Price breakdown</h4>
        <dl className="space-y-1.5 text-sm">
          <Row label="Items total" value={`रू ${o.itemsTotal.toLocaleString()}`} />
          <Row label="Delivery fee" value={`रू ${o.deliveryFee.toLocaleString()}`} />
          <Row label="Service fee (platform)" value={`रू ${o.serviceFee.toLocaleString()}`} />
          <Row label="Grand total" value={`रू ${o.grandTotal.toLocaleString()}`} strong />
          <Row label="Payment method" value={o.method ?? "—"} />
          <Row label="Placed at" value={new Date(o.placedAt).toLocaleString()} />
        </dl>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: FoodOrder["status"] }) {
  const variant = status === "DELIVERED" ? "success" : status === "CANCELLED" ? "danger" : "outline";
  return <Badge variant={variant}>{STATUS_LABEL[status].toLowerCase()}</Badge>;
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
        active ? "border-accent text-accent" : "border-transparent text-muted-fg hover:text-fg")}
    >
      {icon} {label}
    </button>
  );
}