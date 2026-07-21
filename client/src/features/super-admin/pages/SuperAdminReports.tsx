import { useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";
import { toast } from "@/stores/toast.store";

interface ReportData {
  periodDays: number;
  generatedAt: string;
  rows: { vertical: string; count: number; revenue: number }[];
  totals: { count: number; revenue: number };
}

const PERIODS = [7, 30, 90] as const;

/** Escape a value for CSV: wrap in quotes, double any embedded quotes. */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Cross-vertical activity + revenue report with one-click CSV export.
 * The CSV is generated client-side from the exact data shown, so what
 * you see is byte-for-byte what you export.
 */
export function SuperAdminReports() {
  const { saApi } = useSuperAdminApi();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const report = useResource<ReportData>(() => saApi(`/super-admin/reports?days=${days}`), [days]);
  const d = report.data;

  function exportCsv() {
    if (!d) {
      toast.error("Nothing to export yet.");
      return;
    }
    const lines = [
      ["Vertical", "Count", `Revenue (NPR, last ${d.periodDays} days)`].map(csvCell).join(","),
      ...d.rows.map((r) => [r.vertical, r.count, r.revenue.toFixed(2)].map(csvCell).join(",")),
      ["TOTAL (excl. top-ups)", d.totals.count, d.totals.revenue.toFixed(2)].map(csvCell).join(","),
    ];
    // \uFEFF is the UTF-8 BOM — without it Excel misreads non-ASCII text.
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zamzam-report-${d.periodDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Report exported.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Cross-vertical activity and revenue."
        actions={
          <Button variant="accent" onClick={exportCsv} disabled={!d}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Platform report</CardTitle>
          <CardDescription>
            Cancelled bookings and orders are excluded. Top-ups are money movement, not revenue, so the
            total leaves them out.
          </CardDescription>
        </CardHeader>

        <div className="flex flex-wrap gap-2 border-b border-border px-5 pb-4">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                days === p
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-fg hover:border-accent/50"
              }`}
            >
              Last {p} days
            </button>
          ))}
        </div>

        <AsyncBoundary
          state={report.state}
          onRetry={report.refetch}
          label="Reports"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<FileBarChart className="size-6 text-muted-fg" />}
                title="No activity in this period"
                description="Try a longer period."
              />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
                  <th className="px-5 py-3">Vertical</th>
                  <th className="px-5 py-3">Count</th>
                  <th className="px-5 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(d?.rows ?? []).map((r) => (
                  <tr key={r.vertical} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-5 py-3 font-medium">{r.vertical}</td>
                    <td className="px-5 py-3">{r.count}</td>
                    <td className="px-5 py-3 font-semibold">{npr(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              {d && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface-2/50">
                    <td className="px-5 py-3 font-semibold">Total (excl. top-ups)</td>
                    <td className="px-5 py-3 font-semibold">{d.totals.count}</td>
                    <td className="px-5 py-3 font-semibold">{npr(d.totals.revenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            {d && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-fg">
                Generated {new Date(d.generatedAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
          </div>
        </AsyncBoundary>
      </Card>
    </div>
  );
}