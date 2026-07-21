import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Clock, MapPin, Minus, Plus,
  ShoppingBag, ShoppingBasket, Store, Truck,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { Fulfillment, ProductSummary, StoreDetail } from "./types";

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

type Step = "shop" | "checkout" | "done";

export function GroceryDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const detail = useResource<StoreDetail>(() => api.get(endpoints.grocery.detail(id)), [id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.data?.name ?? "Store"}
        subtitle={detail.data ? `${detail.data.address}, ${detail.data.city} • ${detail.data.storeType}` : "Browse the catalog and order."}
        actions={
          <Link to="/app/grocery" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft className="size-4" /> All stores
          </Link>
        }
      />
      <AsyncBoundary state={detail.state} onRetry={detail.refetch} label="Store details">
        {detail.data && (
          <OrderFlow store={detail.data} onDone={() => navigate("/app/grocery/orders")} />
        )}
      </AsyncBoundary>
    </div>
  );
}

function OrderFlow({ store, onDone }: { store: StoreDetail; onDone: () => void }) {
  const [step, setStep] = useState<Step>("shop");
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

  const allProducts = useMemo(
    () => new Map(store.categories.flatMap((c) => c.products).map((p) => [p.id, p])),
    [store],
  );

  const itemsTotal = useMemo(() => {
    let total = 0;
    for (const [productId, qty] of cart) total += (allProducts.get(productId)?.price ?? 0) * qty;
    return total;
  }, [cart, allProducts]);

  const cartCount = useMemo(() => [...cart.values()].reduce((s, q) => s + q, 0), [cart]);
  const freeDelivery = store.freeDeliveryAbove != null && itemsTotal >= store.freeDeliveryAbove;
  const deliveryFee = fulfillment === "delivery" && !freeDelivery ? store.deliveryFee : 0;
  const serviceFee = Math.round(itemsTotal * SERVICE_FEE_RATE);
  const grandTotal = itemsTotal + deliveryFee + serviceFee;
  const belowMinOrder = itemsTotal > 0 && itemsTotal < store.minOrder;

  function setQty(productId: string, qty: number) {
    const product = allProducts.get(productId);
    const cap = Math.min(50, product?.stock ?? 50);
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(productId);
      else next.set(productId, Math.min(qty, cap));
      return next;
    });
  }

  async function submit() {
    if (!customerName.trim() || !customerPhone.trim()) {
      setError("Your name and phone number are required."); return;
    }
    if (fulfillment === "delivery" && !deliveryAddress.trim()) {
      setError("A delivery address is required for delivery orders."); return;
    }
    setSubmitting(true); setError(null);
    try {
      const res = await api.post<{ orderRef: string }>(endpoints.grocery.order(store.id), {
        items: [...cart.entries()].map(([productId, quantity]) => ({ productId, quantity })),
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

  if (store.categories.length === 0) {
    return (
      <Card className="p-8 text-center">
        <ShoppingBasket className="mx-auto size-8 text-muted-fg" />
        <p className="mt-3 font-medium">No products yet</p>
        <p className="mt-1 text-sm text-muted-fg">This store hasn't added any products to order.</p>
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
        <p className="mt-1 text-sm text-muted-fg">The store has been notified and will confirm shortly.</p>
        <div className="mt-6 space-y-2 rounded-xl border border-border bg-surface/60 p-5 text-left text-sm">
          {ref && <Row label="Reference" value={ref} bold />}
          <Row label="Store" value={store.name} />
          <Row label="Items" value={`${cartCount} item(s)`} />
          <Row label="Fulfilment" value={fulfillment === "delivery" ? "Delivery" : "Pickup"} />
          <Row label="Total" value={`रू ${grandTotal.toLocaleString()}`} bold />
        </div>
        <Button variant="accent" className="mt-6" onClick={onDone}>Track my orders</Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {step === "shop" &&
          store.categories.map((cat) => (
            <section key={cat.id}>
              <h3 className="mb-3 font-display text-base font-semibold">{cat.name}</h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {cat.products.map((p) => (
                  <ProductRow key={p.id} product={p} qty={cart.get(p.id) ?? 0} setQty={setQty} />
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
                    fulfillment === f ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-fg hover:bg-surface-2")}
                >
                  {f === "delivery" ? <Truck className="size-4" /> : <Store className="size-4" />}
                  {f === "delivery" ? "Delivery" : "Pickup"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Your name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <Input placeholder="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              {fulfillment === "delivery" && (
                <Input className="sm:col-span-2" placeholder="Delivery address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
              )}
              <Input className="sm:col-span-2" placeholder="Note for the store (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="mb-2 mt-4 text-xs font-medium text-muted-fg">Payment method</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    method === m.id ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-fg hover:bg-surface-2")}
                >{m.label}</button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </Card>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <ShoppingBag className="size-4" /> Your cart
          </h3>
          {cartCount === 0 ? (
            <p className="mt-3 text-sm text-muted-fg">Add products from the catalog to start an order.</p>
          ) : (
            <>
              <div className="mt-3 space-y-2 text-sm">
                {[...cart.entries()].map(([productId, qty]) => {
                  const product = allProducts.get(productId);
                  if (!product) return null;
                  return <Row key={productId} label={`${qty} × ${product.name}`} value={`रू ${(product.price * qty).toLocaleString()}`} />;
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
                  Minimum order is रू {store.minOrder.toLocaleString()} — add रू {(store.minOrder - itemsTotal).toLocaleString()} more.
                </p>
              )}
              {store.freeDeliveryAbove != null && !freeDelivery && itemsTotal > 0 && (
                <p className="mt-2 text-xs text-muted-fg">
                  Add रू {(store.freeDeliveryAbove - itemsTotal).toLocaleString()} more for free delivery.
                </p>
              )}
              {step === "shop" ? (
                <Button variant="accent" className="mt-4 w-full" disabled={belowMinOrder} onClick={() => setStep("checkout")}>
                  Checkout
                </Button>
              ) : (
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("shop")}>Back to store</Button>
                  <Button variant="accent" className="flex-1" disabled={submitting} onClick={submit}>
                    {submitting ? "Placing…" : "Place order"}
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-fg">
            <Clock className="size-3.5" /> {store.deliveryEtaMinutes} min delivery
            <span>•</span>
            <MapPin className="size-3.5" /> {store.city}
          </p>
        </Card>
      </div>
    </div>
  );
}

function ProductRow({ product, qty, setQty }: { product: ProductSummary; qty: number; setQty: (id: string, q: number) => void }) {
  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{product.name}</p>
        <p className="mt-0.5 text-xs text-muted-fg">{product.unit}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          <span className="font-medium">रू {product.price.toLocaleString()}</span>
          {product.mrp != null && product.mrp > product.price && (
            <span className="text-muted-fg line-through">रू {product.mrp.toLocaleString()}</span>
          )}
        </p>
        {!product.inStock && <Badge variant="outline" className="mt-1 text-[10px]">Out of stock</Badge>}
      </div>
      {!product.inStock ? null : qty === 0 ? (
        <Button variant="outline" size="sm" onClick={() => setQty(product.id, 1)}>
          <Plus className="size-4" /> Add
        </Button>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setQty(product.id, qty - 1)} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-surface-2">
            <Minus className="size-4" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
          <button type="button" onClick={() => setQty(product.id, qty + 1)} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-surface-2">
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
      <span className={cn("text-right", bold && "font-display font-bold")}>{value}</span>
    </div>
  );
}