import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";

interface PendingUser {
  id: string; name: string; mobile: string; email?: string;
  role: string; kycStatus: string; createdAt: string;
}

export function SuperAdminApprovals() {
  const { saApi } = useSuperAdminApi();
  const navigate = useNavigate();
  const [items, setItems] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await saApi<{ items: PendingUser[] }>("/super-admin/registrations");
      setItems(res.items);
    } catch { setError("Couldn't load registrations."); }
    finally { setLoading(false); }
  }, [saApi]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, kycStatus: "APPROVED" | "SUSPENDED") {
    setBusy(id);
    try {
      await saApi(`/super-admin/users/${id}/kyc`, { method: "PATCH", body: { kycStatus } });
      setItems((prev) => prev.filter((u) => u.id !== id));
      toast.success(
        kycStatus === "APPROVED" ? "Partner approved" : "Partner rejected",
        kycStatus === "APPROVED" ? "They can now log in and set up their business." : "The applicant has been notified.",
      );
    } catch { setError("Action failed."); toast.error("Action failed", "Please try again."); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Partner approvals</h1>
        <p className="mt-1 text-sm text-muted-fg">Verify driver, hotel, bus-operator and freight registrations.</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

      <div className="rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-fg">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-fg">
            <Clock className="size-8 opacity-40" />
            <p className="text-sm">No pending registrations.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name} <span className="text-xs font-normal text-muted-fg">· {u.role}</span></p>
                  <p className="text-xs text-muted-fg">{u.mobile}{u.email ? ` · ${u.email}` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    title="Review details"
                    aria-label="Review details"
                    onClick={() => navigate(`/x-admin/registrations/${u.id}`)}
                    className="rounded-lg border border-border p-2 text-muted-fg hover:bg-surface-2 hover:text-fg"
                  >
                    <Eye className="size-4" />
                  </button>
                  <Button size="sm" variant="accent" disabled={busy === u.id} onClick={() => decide(u.id, "APPROVED")}>
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => decide(u.id, "SUSPENDED")}>
                    <X className="size-4" /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}