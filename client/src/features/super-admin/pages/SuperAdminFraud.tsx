import { Banknote, Gauge, RefreshCcw, ShieldAlert, Timer, UserX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";

interface FlaggedUser {
  name: string;
  mobile: string | null;
  role: string | null;
}

interface FraudReport {
  evaluatedAt: string;
  windows: { velocityHours: number; behaviourDays: number };
  summary: { cancelHeavy: number; rapidBookers: number; bigTopups: number; cashHeavyDrivers: number };
  cancelHeavy: { userId: string; user: FlaggedUser | null; total: number; cancelled: number; ratio: number }[];
  rapidBookers: { userId: string; user: FlaggedUser | null; count: number }[];
  bigTopups: { userId: string; user: FlaggedUser | null; amount: number }[];
  cashHeavyDrivers: { userId: string; user: FlaggedUser | null; total: number; cash: number; ratio: number }[];
}

function Who({ userId, user }: { userId: string; user: FlaggedUser | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{user?.name ?? userId}</p>
      <p className="truncate text-xs text-muted-fg">{user?.mobile ?? "—"}</p>
    </div>
  );
}

function Severity({ level }: { level: "high" | "medium" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        level === "high" ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning"
      }`}
    >
      {level === "high" ? "High" : "Medium"}
    </span>
  );
}

function SignalSection({
  title,
  description,
  icon: Icon,
  empty,
  children,
}: {
  title: string;
  description: string;
  icon: typeof UserX;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent">
          <Icon className="size-4" />
        </span>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <div className="px-5 pb-5">
        {empty ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-fg">
            No accounts currently match this rule — all clear.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">{children}</div>
        )}
      </div>
    </Card>
  );
}

export function SuperAdminFraud() {
  const { saApi } = useSuperAdminApi();
  const report = useResource<FraudReport>(() => saApi("/super-admin/fraud"));
  const d = report.data;

  const stats = [
    { label: "Cancel-heavy customers", value: d?.summary.cancelHeavy ?? "—", icon: UserX },
    { label: "Rapid bookers (24h)", value: d?.summary.rapidBookers ?? "—", icon: Timer },
    { label: "Large top-ups (24h)", value: d?.summary.bigTopups ?? "—", icon: Banknote },
    { label: "Cash-heavy drivers", value: d?.summary.cashHeavyDrivers ?? "—", icon: Gauge },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI & Fraud"
        subtitle="Model health and fraud signals."
        actions={
          <Button variant="outline" onClick={() => report.refetch()}>
            <RefreshCcw /> Re-evaluate
          </Button>
        }
      />

      {/* Honest framing: these are explainable rules, not a black box. */}
      <Card className="flex items-start gap-3 p-5 text-sm text-muted-fg">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          Signals are computed live from real platform data using explainable rules (behaviour
          window: last {d?.windows.behaviourDays ?? 30} days; velocity window: last{" "}
          {d?.windows.velocityHours ?? 24} hours). A flag is a reason for a human to look — not
          proof of fraud. Last evaluated:{" "}
          {d ? new Date(d.evaluatedAt).toLocaleString() : "…"}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-fg">
                <Icon className="size-4" /> {s.label}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{s.value}</p>
            </Card>
          );
        })}
      </div>

      {report.state === "error" ? (
        <Card className="p-6 text-sm text-muted-fg">
          Couldn't compute fraud signals.{" "}
          <button className="font-medium text-accent hover:underline" onClick={() => report.refetch()}>
            Try again
          </button>
        </Card>
      ) : (
        <>
          <SignalSection
            title="Cancel-heavy customers"
            description="Customers who cancelled 50% or more of their bookings (minimum 3) in the behaviour window — a pattern of driver-baiting or fare probing."
            icon={UserX}
            empty={!d || d.cancelHeavy.length === 0}
          >
            {d?.cancelHeavy.map((r) => (
              <div key={r.userId} className="flex items-center justify-between gap-3 p-3.5">
                <Who userId={r.userId} user={r.user} />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-fg">
                    {r.cancelled}/{r.total} cancelled · {Math.round(r.ratio * 100)}%
                  </span>
                  <Severity level={r.ratio >= 0.75 ? "high" : "medium"} />
                </div>
              </div>
            ))}
          </SignalSection>

          <SignalSection
            title="Rapid bookers"
            description="More than 5 bookings created inside 24 hours — bot activity, promo abuse, or a stuck client hammering the API."
            icon={Timer}
            empty={!d || d.rapidBookers.length === 0}
          >
            {d?.rapidBookers.map((r) => (
              <div key={r.userId} className="flex items-center justify-between gap-3 p-3.5">
                <Who userId={r.userId} user={r.user} />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-fg">{r.count} bookings in 24h</span>
                  <Severity level={r.count >= 10 ? "high" : "medium"} />
                </div>
              </div>
            ))}
          </SignalSection>

          <SignalSection
            title="Large wallet top-ups"
            description="NPR 20,000 or more added to a wallet inside 24 hours — worth confirming the money-in source."
            icon={Banknote}
            empty={!d || d.bigTopups.length === 0}
          >
            {d?.bigTopups.map((r) => (
              <div key={r.userId} className="flex items-center justify-between gap-3 p-3.5">
                <Who userId={r.userId} user={r.user} />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-fg">{npr(r.amount)} in 24h</span>
                  <Severity level={r.amount >= 50000 ? "high" : "medium"} />
                </div>
              </div>
            ))}
          </SignalSection>

          <SignalSection
            title="Cash-heavy drivers"
            description="Drivers settling 90%+ of completed trips (minimum 5) in self-confirmed cash — cash needs no customer confirmation, so a near-total cash share deserves a look."
            icon={Gauge}
            empty={!d || d.cashHeavyDrivers.length === 0}
          >
            {d?.cashHeavyDrivers.map((r) => (
              <div key={r.userId} className="flex items-center justify-between gap-3 p-3.5">
                <Who userId={r.userId} user={r.user} />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-fg">
                    {r.cash}/{r.total} cash · {Math.round(r.ratio * 100)}%
                  </span>
                  <Severity level={r.ratio >= 0.98 ? "high" : "medium"} />
                </div>
              </div>
            ))}
          </SignalSection>
        </>
      )}
    </div>
  );
}