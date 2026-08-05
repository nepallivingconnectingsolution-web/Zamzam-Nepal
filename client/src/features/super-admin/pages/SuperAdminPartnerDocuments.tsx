import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Clock, Eye, FileText, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";
import { cn } from "@/lib/utils";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type PartnerType = "hotel" | "restaurant" | "grocery" | "bus_operator" | "freight";
type StatusFilter = "PENDING" | "APPROVED" | "SUSPENDED";

interface AdminPartnerDocument {
  id: string;
  type: string;
  label: string;
  fileUrl: string;
  fileName: string;
  status: StatusFilter;
  partnerId: string;
  partnerType: PartnerType;
  partnerTypeLabel: string;
  partnerName: string;
  partnerMobile: string;
  updatedAt: string;
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "SUSPENDED", label: "Suspended" },
];

const TYPE_FILTERS: { value: PartnerType | "all"; label: string }[] = [
  { value: "all", label: "All verticals" },
  { value: "hotel", label: "Hotels" },
  { value: "restaurant", label: "Restaurants" },
  { value: "grocery", label: "Grocery" },
  { value: "bus_operator", label: "Bus operators" },
  { value: "freight", label: "Freight" },
];

export function SuperAdminPartnerDocuments() {
  const { saApi } = useSuperAdminApi();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [typeFilter, setTypeFilter] = useState<PartnerType | "all">("all");
  const [items, setItems] = useState<AdminPartnerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (typeFilter !== "all") params.set("partnerType", typeFilter);
      const res = await saApi<AdminPartnerDocument[]>(`/super-admin/partner-documents?${params.toString()}`);
      setItems(res);
    } catch {
      setError("Couldn't load partner documents.");
    } finally {
      setLoading(false);
    }
  }, [saApi, statusFilter, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, status: "APPROVED" | "SUSPENDED") {
    setBusy(id);
    try {
      await saApi(`/super-admin/partner-documents/${id}/verify`, { method: "PATCH", body: { status } });
      setItems((prev) => prev.filter((d) => d.id !== id));
      toast.success(
        status === "APPROVED" ? "Document approved" : "Document rejected",
        status === "APPROVED" ? "It now shows as verified for the partner." : "The partner can upload a replacement.",
      );
    } catch {
      toast.error("Action failed", "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Partner documents</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Verify business licences, owner ID and legal documents for hotels, restaurants, grocery stores, bus
          operators and freight partners — the same trust gate drivers go through.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTypeFilter(f.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm",
              typeFilter === f.value
                ? "border-accent bg-accent/10 font-medium text-accent-600 dark:text-accent"
                : "border-border text-muted-fg hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm",
              statusFilter === f.value
                ? "border-accent bg-accent/10 font-medium text-accent-600 dark:text-accent"
                : "border-border text-muted-fg hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-fg">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-fg">
            <Clock className="size-8 opacity-40" />
            <p className="text-sm">No {statusFilter.toLowerCase()} documents.</p>
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
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-fg">
                        <Building2 className="size-3" /> {d.partnerTypeLabel}
                      </span>
                    </p>
                    <p className="text-xs text-muted-fg">
                      {d.partnerName} ({d.partnerMobile})
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