import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Check, X, Phone, Mail, Calendar, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";

interface UserDetail {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  kycStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  createdAt: string;
}

interface WalletDetail {
  available: string;
  escrow: string;
  currency: string;
}

interface TransactionRow {
  id: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  description?: string;
  createdAt: string;
}

interface UserDetailResponse {
  user: UserDetail;
  wallet: WalletDetail | null;
  transactions: TransactionRow[];
}

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  driver: "Driver",
  hotel: "Hotel partner",
  bus_operator: "Bus operator",
  freight: "Freight partner",
  admin: "Admin",
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "danger" | "default"> = {
  PENDING: "warning",
  APPROVED: "success",
  SUSPENDED: "danger",
};

export function SuperAdminRegistrationReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { saApi } = useSuperAdminApi();

  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await saApi<UserDetailResponse>(`/super-admin/users/${id}`);
      setData(res);
    } catch {
      setError("Couldn't load this registration.");
    } finally {
      setLoading(false);
    }
  }, [saApi, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(kycStatus: "APPROVED" | "SUSPENDED") {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await saApi(`/super-admin/users/${id}/kyc`, { method: "PATCH", body: { kycStatus } });
      toast.success(
        kycStatus === "APPROVED" ? "Partner approved" : "Partner rejected",
        kycStatus === "APPROVED" ? "They can now log in and set up their business." : "The applicant has been notified.",
      );
      navigate("/x-admin/approvals");
    } catch {
      setError("Action failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/x-admin/approvals"
        className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Back to approvals
      </Link>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-fg">
          Loading…
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-fg">
          {error ?? "Registration not found."}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">{data.user.name}</h1>
              <p className="mt-1 text-sm text-muted-fg">
                {ROLE_LABEL[data.user.role] ?? data.user.role} registration
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[data.user.kycStatus] ?? "default"}>
              {data.user.kycStatus}
            </Badge>
          </div>

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Contact details</CardTitle>
              <CardDescription>Information provided at registration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-muted-fg" />
                <span>{data.user.mobile}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-fg" />
                <span>{data.user.email ?? <span className="text-muted-fg">Not provided</span>}</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-muted-fg" />
                <span>{ROLE_LABEL[data.user.role] ?? data.user.role}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-muted-fg" />
                <span>Registered {new Date(data.user.createdAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {data.user.kycStatus === "PENDING" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="accent"
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => decide("APPROVED")}
              >
                <Check className="size-4" /> Approve registration
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => decide("SUSPENDED")}
              >
                <X className="size-4" /> Reject registration
              </Button>
            </div>
          )}

          {data.user.kycStatus !== "PENDING" && (
            <p className="text-sm text-muted-fg">
              This registration has already been {data.user.kycStatus === "APPROVED" ? "approved" : "rejected"}.
              {" "}You can still change the decision below.
            </p>
          )}

          {data.user.kycStatus !== "PENDING" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {data.user.kycStatus !== "APPROVED" && (
                <Button variant="accent" disabled={busy} onClick={() => decide("APPROVED")}>
                  <Check className="size-4" /> Approve
                </Button>
              )}
              {data.user.kycStatus !== "SUSPENDED" && (
                <Button variant="outline" disabled={busy} onClick={() => decide("SUSPENDED")}>
                  <X className="size-4" /> Suspend
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
