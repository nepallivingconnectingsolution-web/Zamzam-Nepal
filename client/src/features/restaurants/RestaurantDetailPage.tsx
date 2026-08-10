import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Bike, CheckCircle2, Clock, Flame, Leaf,
  MapPin, Minus, Plus, ShoppingBag, Store, UtensilsCrossed,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PhoneField, NameInput, isValidPhone } from "@/components/ui/phone-field";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { Fulfillment, MenuItemSummary, RestaurantDetail } from "./types";

const PAYMENT_METHODS = [
  { id: "wallet", label: "Zamzam Wallet" },
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "connectips", label: "ConnectIPS" },
  { id: "imepay", label: "IME Pay" },
  { id: "card", label: "Card" },
  { id: "cash", label: "Cash on delivery" },
];

const SERVICE_FEE_RATE = 0.02; // display estimate only — the server computes the real total

type Step = "menu" | "checkout" | "done";

export function RestaurantDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const detail = useResource<RestaurantDetail>(() => api.get(endpoints.restaurants.detail(id)), [id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.data?.name ?? "Restaurant"}
        subtitle={detail.data ? `${detail.data.address}, ${detail.data.city} • ${detail.data.cuisine}` : "Browse the menu and order."}
        actions={
          <Link to="/app/restaurants" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft className="size-4" /> All restaurants
          </Link>
        }
      />
      <AsyncBoundary state={detail.state} onRetry={detail.refetch} label="Restaurant details">
        {detail.data && (
          <OrderFlow restaurant={detail.data} onDone={() => navigate("/app/restaurants/orders")} />
        )}
      </AsyncBoundary>
    </div>
  );
}

function OrderFlow({ restaurant, onDone }: { restaurant: RestaurantDetail; onDone: () => void }) {
  const [step, setStep] = useState<Step>("menu");
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("esewa");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const allItems = useMemo(
    () => new Map(restaurant.categories.flatMap((c) => c.items).map((i) => [i.id, i])),
    [restaurant],
  );

  const itemsTotal = useMemo(() => {
    let total = 0;
    for (const [itemId, qty] of cart) total += (allItems.get(itemId)?.price ?? 0) * qty;
    return total;
  }, [cart, allItems]);

  const cartCount = useMemo(() => [...cart.values()].reduce((s, q) => s + q, 0), [cart]);
  // An empty cart costs nothing to deliver. Without the itemsTotal guard the
  // sticky bar reads "Your order is empty" next to a non-zero total, because
  // the delivery fee applied before anything had been added.
  const deliveryFee = fulfillment === "delivery" && itemsTotal > 0 ? restaurant.deliveryFee : 0;
  const serviceFee = Math.round(itemsTotal * SERVICE_FEE_RATE);
  const grandTotal = itemsTotal + deliveryFee + serviceFee;
  const belowMinOrder = itemsTotal > 0 && itemsTotal < restaurant.minOrder;

  function setQty(itemId: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(itemId);
      else next.set(itemId, Math.min(qty, 20));
      return next;
    });
  }

  async function submit() {
    if (!customerName.trim()) {
      setError("Your name is required."); return;
    }
    // trim() alone accepted a 2-character "phone"; require a complete
    // number for the selected country code.
    if (!isValidPhone(customerPhone)) {
      setError("Enter a complete phone number."); return;
    }
    if (fulfillment === "delivery" && !deliveryAddress.trim()) {
      setError("A delivery address is required for delivery orders."); return;
    }
    setSubmitting(true); setError(null);
    try {
      const res = await api.post<{ orderRef: string }>(endpoints.restaurants.order(restaurant.id), {
        items: [...cart.entries()].map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
        fulfillment, customerName, customerPhone,
        deliveryAddress: fulfillment === "delivery" ? deliveryAddress : undefined,
        note: note || undefined,
        method,
      });
      setRef(res.orderRef);
      setStep("done");
      toast.success("Order placed", `Reference ${res.orderRef}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? ((e.detail as { message?: string })?.message ?? "Couldn't place the order.")
          : "Couldn't place the order.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (restaurant.categories.length === 0) {
    return (
      <Card className="p-8 text-center">
        <UtensilsCrossed className="mx-auto size-8 text-muted-fg" />
        <p className="mt-3 font-medium">No menu yet</p>
        <p className="mt-1 text-sm text-muted-fg">This restaurant hasn't added any dishes to order.</p>
      </Card>
    );
  }

  if (step === "done") {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-8" />
        </div>
        <h2 className="font-display text-xl font-bold">Order placed!</h2>
        <p className="mt-1 text-sm text-muted-fg">The kitchen has been notified and will confirm shortly.</p>
        <div className="mt-6 space-y-2 rounded-xl border border-border bg-surface/60 p-5 text-left text-sm">
          {ref && <Row label="Reference" value={ref} bold />}
          <Row label="Restaurant" value={restaurant.name} />
          <Row label="Items" value={`${cartCount} item(s)`} />
          <Row label="Fulfilment" value={fulfillment === "delivery" ? "Delivery" : "Pickup"} />
          <Row label="Total" value={`रू ${grandTotal.toLocaleString()}`} bold />
        </div>
        <Button variant="accent" className="mt-6" onClick={onDone}>Track my orders</Button>
      </Card>
    );
  }

  const primaryAction =
    step === "menu"
      ? { label: "Checkout", disabled: cartCount === 0 || belowMinOrder, onClick: () => setStep("checkout") }
      : { label: submitting ? "Placing…" : "Place order", disabled: submitting, onClick: submit };

  return (
    <div className="space-y-6">
      {/* ── Menu / checkout column ── */}
      <div className="min-w-0 space-y-6 pb-24">
        {step === "menu" &&
          restaurant.categories.map((cat) => (
            <section key={cat.id}>
              <h3 className="mb-3 font-display text-base font-semibold">{cat.name}</h3>
              <div className="space-y-2.5">
                {cat.items.map((item) => (
                  <MenuItemRow key={item.id} item={item} qty={cart.get(item.id) ?? 0} setQty={setQty} />
                ))}
              </div>
            </section>
          ))}

        {step === "checkout" && (
          <Card className="p-5">
            <h3 className="mb-4 font-display text-base font-semibold">Checkout</h3>
            <p className="mb-2 text-xs font-medium text-muted-fg">Fulfilment</p>
            <div className="mb-4 flex gap-2">
              {(["delivery", "pickup"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFulfillment(f)}
                  className={cn("flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                    fulfillment === f ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border text-muted-fg hover:bg-surface-2")}
                >
                  {f === "delivery" ? <Bike className="size-4" /> : <Store className="size-4" />}
                  {f === "delivery" ? "Delivery" : "Pickup"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <NameInput placeholder="Your name" value={customerName} onChange={setCustomerName} />
              <PhoneField value={customerPhone} onChange={setCustomerPhone} showError />
              {fulfillment === "delivery" && (
                <Input className="sm:col-span-2" placeholder="Delivery address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
              )}
              <Input className="sm:col-span-2" placeholder="Note for the kitchen (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="mb-2 mt-4 text-xs font-medium text-muted-fg">Payment method</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    method === m.id ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent" : "border-border text-muted-fg hover:bg-surface-2")}
                >{m.label}</button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </Card>
        )}
      </div>

      {/* ── Order summary column — desktop only; mobile gets the fixed bottom bar ── */}
      <div className="hidden">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <ShoppingBag className="size-4" /> Your order
          </h3>
          {cartCount === 0 ? (
            <p className="mt-3 text-sm text-muted-fg">Add dishes from the menu to start an order.</p>
          ) : (
            <>
              <div className="mt-3 space-y-2 text-sm">
                {[...cart.entries()].map(([itemId, qty]) => {
                  const item = allItems.get(itemId);
                  if (!item) return null;
                  return <Row key={itemId} label={`${qty} × ${item.name}`} value={`रू ${(item.price * qty).toLocaleString()}`} />;
                })}
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                <Row label="Items" value={`रू ${itemsTotal.toLocaleString()}`} />
                <Row label="Delivery fee" value={deliveryFee > 0 ? `रू ${deliveryFee.toLocaleString()}` : "Free"} />
                <Row label="Service fee (2%)" value={`रू ${serviceFee.toLocaleString()}`} />
                <Row label="Total" value={`रू ${grandTotal.toLocaleString()}`} bold />
              </div>
              {belowMinOrder && (
                <p className="mt-3 text-xs text-danger">
                  Minimum order is रू {restaurant.minOrder.toLocaleString()} — add रू {(restaurant.minOrder - itemsTotal).toLocaleString()} more.
                </p>
              )}
              {step === "menu" ? (
                <Button variant="accent" className="mt-4 w-full" disabled={belowMinOrder} onClick={() => setStep("checkout")}>
                  Checkout
                </Button>
              ) : (
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("menu")}>Back to menu</Button>
                  <Button variant="accent" className="flex-1" disabled={submitting} onClick={submit}>
                    {submitting ? "Placing…" : "Place order"}
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-fg">
            <Clock className="size-3.5" /> Open {restaurant.openTime}–{restaurant.closeTime}
            <span>•</span>
            <MapPin className="size-3.5" /> {restaurant.city}
          </p>
        </Card>
      </div>

      {/* Sticky mobile order bar — mirrors BusDetailPage's / HotelDetailPage's
          pattern so checkout stays reachable without scrolling past the menu. */}
      {/* bottom-[4.75rem] — the customer shell's own bottom tab bar (see
          CustomerShell) is a separate fixed element pinned to bottom-0; this
          sits directly above it instead of underneath/behind it. */}
      <div className="fixed inset-x-0 bottom-[4.75rem] z-50 border-t border-border bg-card/95 px-4 py-3 shadow-lift backdrop-blur-xl ">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {step === "checkout" && (
            <Button variant="outline" size="icon" aria-label="Back to menu" onClick={() => setStep("menu")}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-fg">
              {cartCount > 0 ? `${cartCount} item${cartCount > 1 ? "s" : ""}` : "Your order is empty"}
            </p>
            <p className="font-display text-base font-bold font-tabular leading-tight">रू {grandTotal.toLocaleString()}</p>
          </div>
          <Button variant="accent" className="shrink-0" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MenuItemRow({ item, qty, setQty }: { item: MenuItemSummary; qty: number; setQty: (id: string, q: number) => void }) {
  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{item.name}</p>
          {item.isVeg && (
            <Badge variant="success" className="gap-1 text-[10px]"><Leaf className="size-3" /> Veg</Badge>
          )}
          {item.spiceLevel > 0 && (
            <span className="inline-flex items-center text-warning">
              {Array.from({ length: item.spiceLevel }).map((_, i) => <Flame key={i} className="size-3" />)}
            </span>
          )}
        </div>
        {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-fg">{item.description}</p>}
        <p className="mt-1 text-xs text-muted-fg">रू {item.price.toLocaleString()} • ~{item.prepTimeMin} min</p>
      </div>
      {qty === 0 ? (
        <Button variant="outline" size="sm" onClick={() => setQty(item.id, 1)}>
          <Plus className="size-4" /> Add
        </Button>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setQty(item.id, qty - 1)} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-surface-2">
            <Minus className="size-4" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
          <button type="button" onClick={() => setQty(item.id, qty + 1)} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-surface-2">
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-fg">{label}</span>
      <span className={cn("text-right font-tabular", bold && "font-display font-bold")}>{value}</span>
    </div>
  );
}