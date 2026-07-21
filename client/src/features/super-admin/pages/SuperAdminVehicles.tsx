import { useEffect, useState, useCallback } from "react";
import { Car, Check, ShieldOff, Clock, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";
import { cn } from "@/lib/utils";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

interface AdminVehicle {
  id: string;
  category: string;
  makeModel: string;
  plateNumber: string;
  maxWeightKg: number;
  verificationStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  driverName: string;
  driverMobile: string;
  createdAt: string;
}

interface AdminDriverDocument {
  id: string;
  type: "citizenship" | "license" | "nid";
  label: string;
  fileUrl: string;
  fileName: string;
  status: "PENDING" | "APPROVED" | "SUSPENDED";
  driverId: string;
  driverName: string;
  driverMobile: string;
  updatedAt: string;
}

type StatusFilter = "PENDING" | "APPROVED" | "SUSPENDED";
type Tab = "vehicles" | "documents";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "SUSPENDED", label: "Suspended" },
];

const TABS: { value: Tab; label: string }[] = [
  { value: "vehicles", label: "Vehicles" },
  { value: "documents", label: "Documents" },
];

export function SuperAdminVehicles() {
  const [tab, setTab] = useState<Tab>("vehicles");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Drivers & vehicles</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Verify vehicle registrations and driver identity documents — both gate a driver going online.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium",
              tab === t.value ? "border-accent text-accent-600 dark:text-accent" : "border-transparent text-muted-fg hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "vehicles" ? <VehiclesTab /> : <DocumentsTab />}
    </div>
  );
}

/* ─────────────────────────────── Vehicles ─────────────────────────────── */

function VehiclesTab() {
  const { saApi } = useSuperAdminApi();
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [items, setItems] = useState<AdminVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await saApi<AdminVehicle[]>(`/super-admin/vehicles?status=${filter}`);
      setItems(res);
    } catch { setError("Couldn't load vehicles."); }
    finally { setLoading(false); }
  }, [saApi, filter]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, status: "APPROVED" | "SUSPENDED") {
    setBusy(id);
    try {
      await saApi(`/super-admin/vehicles/${id}/verify`, { method: "PATCH", body: { status } });
      setItems((prev) => prev.filter((v) => v.id !== id));
      toast.success(
        status === "APPROVED" ? "Vehicle approved" : "Vehicle suspended",
        status === "APPROVED"
          ? "The driver can now activate it and go online."
          : "It's out of the matching pool immediately.",
      );
    } catch { toast.error("Action failed", "Please try again."); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm",
              filter === f.value
                ? "border-accent bg-accent/10 font-medium text-accent-600 dark:text-accent"
                : "border-border text-muted-fg hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

      <div className="rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-fg">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-fg">
            <Clock className="size-8 opacity-40" />
            <p className="text-sm">No {filter.toLowerCase()} vehicles.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    <Car className="size-4 text-muted-fg" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {v.makeModel}
                      <span className="ml-2 text-xs font-normal uppercase text-muted-fg">{v.plateNumber}</span>
                    </p>
                    <p className="text-xs text-muted-fg">
                      <span className="capitalize">{v.category.replace("_", " ")}</span> · up to {v.maxWeightKg} kg ·{" "}
                      {v.driverName} ({v.driverMobile})
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={v.verificationStatus === "APPROVED" ? "success" : v.verificationStatus === "PENDING" ? "warning" : "danger"}>
                    {v.verificationStatus}
                  </Badge>
                  {v.verificationStatus !== "APPROVED" && (
                    <Button size="sm" variant="accent" disabled={busy === v.id} onClick={() => decide(v.id, "APPROVED")}>
                      <Check className="size-4" /> Approve
                    </Button>
                  )}
                  {v.verificationStatus !== "SUSPENDED" && (
                    <Button size="sm" variant="outline" disabled={busy === v.id} onClick={() => decide(v.id, "SUSPENDED")}>
                      <ShieldOff className="size-4" /> Suspend
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── Documents ──────────────────────────────── */

function DocumentsTab() {
  const { saApi } = useSuperAdminApi();
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [items, setItems] = useState<AdminDriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await saApi<AdminDriverDocument[]>(`/super-admin/driver-documents?status=${filter}`);
      setItems(res);
    } catch { setError("Couldn't load documents."); }
    finally { setLoading(false); }
  }, [saApi, filter]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, status: "APPROVED" | "SUSPENDED") {
    setBusy(id);
    try {
      await saApi(`/super-admin/driver-documents/${id}/verify`, { method: "PATCH", body: { status } });
      setItems((prev) => prev.filter((d) => d.id !== id));
      toast.success(
        status === "APPROVED" ? "Document approved" : "Document rejected",
        status === "APPROVED" ? "It now shows as verified for the driver." : "The driver can upload a replacement.",
      );
    } catch { toast.error("Action failed", "Please try again."); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm",
              filter === f.value
                ? "border-accent bg-accent/10 font-medium text-accent-600 dark:text-accent"
                : "border-border text-muted-fg hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

      <div className="rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-fg">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-fg">
            <Clock className="size-8 opacity-40" />
            <p className="text-sm">No {filter.toLowerCase()} documents.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    <FileText className="size-4 text-muted-fg" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {d.label}
                      <span className="ml-2 text-xs font-normal text-muted-fg">{d.driverName} ({d.driverMobile})</span>
                    </p>
                    <a
                      href={`${API_BASE_URL}${d.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <Eye className="size-3.5" /> View file
                    </a>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={d.status === "APPROVED" ? "success" : d.status === "PENDING" ? "warning" : "danger"}>
                    {d.status}
                  </Badge>
                  {d.status !== "APPROVED" && (
                    <Button size="sm" variant="accent" disabled={busy === d.id} onClick={() => decide(d.id, "APPROVED")}>
                      <Check className="size-4" /> Approve
                    </Button>
                  )}
                  {d.status !== "SUSPENDED" && (
                    <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => decide(d.id, "SUSPENDED")}>
                      <ShieldOff className="size-4" /> Reject
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}