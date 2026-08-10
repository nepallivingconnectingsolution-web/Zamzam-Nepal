import { useEffect, useState } from "react";
import {
  ChevronDown, ChevronUp, ClipboardList, ListPlus,
  Mail, Package, Phone, Plus, ShieldCheck, ShoppingBasket, Trash2, User,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TimeField } from "@/components/ui/time-field";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import {
  NEXT_STATUS, STATUS_LABEL,
  type GroceryOrder, type PartnerProductCategory, type PartnerProduct, type PartnerStore,
} from "./types";

type Tab = "stores" | "orders";
const ORDER_POLL_MS = 15_000;

export function GroceryPartnerManager({
  title = "Stores",
  subtitle = "Manage your stores, catalog and live orders.",
  initialTab = "stores",
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
        <TabButton active={tab === "stores"} onClick={() => setTab("stores")} icon={<ShoppingBasket className="size-4" />} label="Stores & catalog" />
        <TabButton active={tab === "orders"} onClick={() => setTab("orders")} icon={<ClipboardList className="size-4" />} label="Orders" />
      </div>
      {tab === "stores" && <StoresTab />}
      {tab === "orders" && <OrdersTab />}
    </div>
  );
}

/* ───────────────────────────── Stores & catalog ─────────────────────────── */

function StoresTab() {
  const stores = useResource<PartnerStore[]>(() => api.get(endpoints.grocery.partner.stores), []);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="accent" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close form" : "Add store"}
        </Button>
      </div>
      {open && <AddStoreForm onAdded={() => { setOpen(false); stores.refetch(); }} />}
      <AsyncBoundary state={stores.state} onRetry={stores.refetch} label="Your stores"
        empty={<EmptyState icon={<ShoppingBasket className="size-6" />} title="No stores yet" description="Add your first store, then add categories and products so customers can order." />}
      >
        <div className="space-y-3">
          {stores.data?.map((s) => (
            <Card key={s.id} className="overflow-hidden">
              <button type="button" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <div>
                  <h3 className="font-display text-base font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted-fg">{s.address}, {s.city} • {s.storeType}</p>
                  <p className="mt-0.5 text-xs text-muted-fg">
                    Open {s.openTime}–{s.closeTime} • Delivery रू {s.deliveryFee.toLocaleString()} • Min order रू {s.minOrder.toLocaleString()} • ETA {s.deliveryEtaMinutes} min
                  </p>
                </div>
                {expandedId === s.id ? <ChevronUp className="size-4 text-muted-fg" /> : <ChevronDown className="size-4 text-muted-fg" />}
              </button>
              {expandedId === s.id && (
                <div className="space-y-6 border-t border-border p-5">
                  <CategoriesPanel storeId={s.id} />
                  <ProductsPanel storeId={s.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function AddStoreForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [storeType, setStoreType] = useState("Supermarket");
  const [openTime, setOpenTime] = useState("07:00");
  const [closeTime, setCloseTime] = useState("22:00");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState("");
  const [deliveryEtaMinutes, setDeliveryEtaMinutes] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !city.trim() || !address.trim()) {
      setError("Store name, city, and address are required."); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post(endpoints.grocery.partner.stores, {
        name, city, address, description, storeType, openTime, closeTime,
        deliveryFee: Number(deliveryFee) || 0,
        minOrder: Number(minOrder) || 0,
        freeDeliveryAbove: freeDeliveryAbove ? Number(freeDeliveryAbove) : undefined,
        deliveryEtaMinutes: Number(deliveryEtaMinutes) || 30,
      });
      toast.success("Store added", "Now add product categories and items so customers can order.");
      onAdded();
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't add store.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-3 font-display text-sm font-semibold">Add a store</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Store name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input className="sm:col-span-2" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input className="sm:col-span-2" placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input placeholder="Store type (e.g. Supermarket, Kirana Store)" value={storeType} onChange={(e) => setStoreType(e.target.value)} />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-fg">
          Delivery ETA (minutes)
          <Input type="number" value={deliveryEtaMinutes} onChange={(e) => setDeliveryEtaMinutes(e.target.value)} />
        </label>
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
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-fg">
          Free delivery above (रू, optional)
          <Input type="number" value={freeDeliveryAbove} onChange={(e) => setFreeDeliveryAbove(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <Button variant="accent" className="mt-4" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add store"}
      </Button>
    </Card>
  );
}

function CategoriesPanel({ storeId }: { storeId: string }) {
  const categories = useResource<PartnerProductCategory[]>(
    () => api.get(endpoints.grocery.partner.categories(storeId)), [storeId],
  );
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.post(endpoints.grocery.partner.categories(storeId), { name });
      setName("");
      toast.success("Category added");
      categories.refetch();
    } catch { toast.error("Couldn't add category"); }
    finally { setSubmitting(false); }
  }

  async function remove(categoryId: string) {
    try {
      await api.delete(endpoints.grocery.partner.category(storeId, categoryId));
      toast.success("Category removed", "Its products moved to \"Other items\".");
      categories.refetch();
    } catch { toast.error("Couldn't remove category"); }
  }

  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-1.5 font-display text-sm font-semibold">
        <ListPlus className="size-4" /> Product categories
      </h4>
      <div className="flex gap-2">
        <Input placeholder="e.g. Fruits & Vegetables, Dairy, Snacks" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button variant="outline" size="sm" disabled={submitting} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <AsyncBoundary state={categories.state} onRetry={categories.refetch} label="Categories"
        empty={<p className="text-xs text-muted-fg">No categories yet — products without one appear under "Other items".</p>}
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

function ProductsPanel({ storeId }: { storeId: string }) {
  const items = useResource<PartnerProduct[]>(
    () => api.get(endpoints.grocery.partner.products(storeId)), [storeId],
  );
  const categories = useResource<PartnerProductCategory[]>(
    () => api.get(endpoints.grocery.partner.categories(storeId)), [storeId],
  );
  const [open, setOpen] = useState(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);

  async function remove(productId: string) {
    try {
      await api.delete(endpoints.grocery.partner.product(storeId, productId));
      toast.success("Product removed");
      items.refetch();
    } catch { toast.error("Couldn't remove product"); }
  }

  async function toggleAvailability(item: PartnerProduct) {
    try {
      await api.patch(endpoints.grocery.partner.product(storeId, item.id), {
        name: item.name, description: item.description ?? undefined, categoryId: item.categoryId ?? undefined,
        unit: item.unit, price: item.price, mrp: item.mrp ?? undefined, stock: item.stock,
        tags: item.tags, isAvailable: !item.isAvailable,
      });
      items.refetch();
    } catch { toast.error("Couldn't update product"); }
  }

  async function restock(item: PartnerProduct) {
    const raw = window.prompt(`Add how many units to "${item.name}"? (current stock: ${item.stock})`, "10");
    const qty = Number(raw);
    if (!raw || !qty || qty <= 0) return;
    setRestockingId(item.id);
    try {
      await api.post(endpoints.grocery.partner.restock(storeId, item.id), { quantity: qty });
      toast.success("Stock updated", `${item.name} now has ${item.stock + qty} in stock.`);
      items.refetch();
    } catch { toast.error("Couldn't update stock"); }
    finally { setRestockingId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-display text-sm font-semibold">
          <Package className="size-4" /> Products
        </h4>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" /> {open ? "Close" : "Add product"}
        </Button>
      </div>
      {open && (
        <AddProductForm
          storeId={storeId}
          categories={categories.data ?? []}
          onAdded={() => { setOpen(false); items.refetch(); }}
        />
      )}
      <AsyncBoundary state={items.state} onRetry={items.refetch} label="Products"
        empty={<EmptyState icon={<Package className="size-5" />} title="No products yet" description="Add a product so customers can order it from this store." />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items.data?.map((i) => (
            <div key={i.id} className="flex items-start justify-between rounded-xl border border-border p-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium">{i.name}</p>
                  <Badge variant="outline" className="text-[10px]">{i.unit}</Badge>
                  {i.stock <= 5 && <Badge variant={i.stock === 0 ? "danger" : "outline"} className="text-[10px]">{i.stock === 0 ? "Out of stock" : `Low: ${i.stock} left`}</Badge>}
                  {!i.isAvailable && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                </div>
                <p className="text-xs text-muted-fg">
                  रू {i.price.toLocaleString()}
                  {i.mrp != null && i.mrp > i.price && <span className="ml-1 line-through">रू {i.mrp.toLocaleString()}</span>}
                  {" • "}Stock: {i.stock}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={restockingId === i.id} onClick={() => restock(i)}>
                    {restockingId === i.id ? "…" : "Restock"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAvailability(i)}>
                    {i.isAvailable ? "Hide" : "Show"}
                  </Button>
                  <button type="button" onClick={() => remove(i.id)} className="text-muted-fg hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function AddProductForm({
  storeId, categories, onAdded,
}: { storeId: string; categories: PartnerProductCategory[]; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("1 pc");
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [stock, setStock] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const p = Number(price);
    if (!name.trim() || !p || p <= 0) {
      setError("A product name and a positive price are required."); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post(endpoints.grocery.partner.products(storeId), {
        name, description: description || undefined, price: p,
        mrp: mrp ? Number(mrp) : undefined,
        stock: Number(stock) || 0,
        unit, categoryId: categoryId || undefined,
      });
      toast.success("Product added");
      onAdded();
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't add product.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card className="bg-surface-2/60 p-4">
      <div className="grid gap-2.5 sm:grid-cols-4">
        <Input placeholder="Product name (e.g. Fresh Milk)" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <Input placeholder="Unit (e.g. 1 L, 500 g)" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <Input placeholder="Stock (units)" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-4">
        <Input placeholder="Price (रू)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="MRP (रू, optional)" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} />
        <SelectField
          className="sm:col-span-2"
          value={categoryId}
          onChange={setCategoryId}
          placeholder="No category"
          options={[{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>
      <Input className="mt-2.5" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Adding…" : "Add product"}
      </Button>
    </Card>
  );
}

/* ───────────────────────────── Orders (store fulfillment board) ─────────── */

function OrdersTab() {
  const orders = useResource<GroceryOrder[]>(() => api.get(endpoints.grocery.partner.orders), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => orders.refetch(), ORDER_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setStatus(order: GroceryOrder, status: GroceryOrder["status"]) {
    setBusyId(order.id);
    try {
      await api.post(endpoints.grocery.partner.orderStatus(order.id), { status });
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
          const canReject = o.status === "PENDING" || o.status === "CONFIRMED";
          return (
            <Card key={o.id} className="overflow-hidden p-0">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(expanded ? null : o.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedId(expanded ? null : o.id);
                  }
                }}
                className="flex w-full flex-col gap-3 p-5 text-left sm:flex-row sm:items-center sm:justify-between cursor-pointer"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold">{o.customerName}</h3>
                    <StatusBadge status={o.status} />
                    <span className="text-xs text-muted-fg">{o.orderRef}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-fg">
                    {o.store.storeName} • {o.items.reduce((s, i) => s + i.quantity, 0)} item(s) • {o.fulfillment === "delivery" ? "Delivery" : "Pickup"} • {new Date(o.placedAt).toLocaleTimeString()}
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
              </div>
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

function OrderDetailPanel({ order: o }: { order: GroceryOrder }) {
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
            <Row key={i.id} label={`${i.quantity} × ${i.name} (${i.unit})`} value={`रू ${i.lineTotal.toLocaleString()}`} />
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

function StatusBadge({ status }: { status: GroceryOrder["status"] }) {
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
