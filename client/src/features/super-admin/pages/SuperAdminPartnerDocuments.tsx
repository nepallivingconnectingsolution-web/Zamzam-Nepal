import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ExternalLink, FileText, FolderOpen, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/async-states";
import { SecureFile } from "@/components/shared/secure-file";
import { useResource } from "@/hooks/useResource";
import { cn } from "@/lib/utils";
import { SuperAdminApiError, useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";
import {
  ROLE_LABEL,
  STAGE_LABEL,
  STAGE_TONE,
  type ApprovalBucket,
  type ApprovalRole,
  type PartnerRecord,
  type RecordDocument,
} from "@/features/super-admin/approvals.types";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const STATUS_TABS: { value: ApprovalBucket | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
];

const TYPES: { value: ApprovalRole | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "driver", label: "Drivers" },
  { value: "hotel", label: "Hotels" },
  { value: "restaurant", label: "Restaurants" },
  { value: "grocery", label: "Grocery" },
  { value: "bus_operator", label: "Bus" },
  { value: "freight", label: "Freight" },
];

const DOC_BADGE = {
  PENDING: { variant: "warning", label: "Pending" },
  APPROVED: { variant: "success", label: "Verified" },
  REJECTED: { variant: "danger", label: "Rejected" },
} as const;

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function DocumentRow({ doc, onDecided }: { doc: RecordDocument; onDecided: () => void }) {
  const { saApi, saBlob } = useSuperAdminApi();
  const [busy, setBusy] = useState(false);
  const badge = DOC_BADGE[doc.status];

  // Identity documents a driver uploaded from their portal (citizenship,
  // licence, NID) sit outside the application review, so they are decided here.
  async function decide(status: "APPROVED" | "SUSPENDED") {
    setBusy(true);
    try {
      await saApi(`/super-admin/driver-documents/${doc.id}/verify`, { method: "PATCH", body: { status } });
      toast.success(status === "APPROVED" ? "Document approved" : "Document rejected");
      onDecided();
    } catch (err) {
      toast.error(err instanceof SuperAdminApiError ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      {doc.fileId ? (
        <SecureFile
          fileKey={doc.fileId}
          load={() => saBlob(`/super-admin/files/${doc.fileId}`)}
          mimeType={doc.mimeType}
          name={doc.fileName}
          className="size-12"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-fg">
          <FileText className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {doc.label}
          {doc.group === "VEHICLE" && <span className="ml-1.5 text-xs font-normal text-muted-fg">Vehicle</span>}
        </p>
        <p className="truncate text-xs text-muted-fg">
          {doc.fileName} · uploaded {when(doc.uploadedAt)}
        </p>
        {doc.status === "REJECTED" && doc.reviewNote && <p className="text-xs text-error">Reason: {doc.reviewNote}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {doc.fileUrl && (
          <a
            href={`${API_BASE_URL}${doc.fileUrl}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            aria-label={`View file for ${doc.label}`}
          >
            <ExternalLink className="size-3.5" /> View file
          </a>
        )}
        {doc.source === "driver_legacy" && (
          <>
            {doc.status !== "APPROVED" && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void decide("APPROVED")} aria-label={`Approve ${doc.label}`}>
                <Check className="size-4" /> Approve
              </Button>
            )}
            {doc.status !== "REJECTED" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("SUSPENDED")} aria-label={`Reject ${doc.label}`}>
                <X className="size-4" /> Reject
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function RecordCard({ record, onDecided }: { record: PartnerRecord; onDecided: () => void }) {
  const [open, setOpen] = useState(false);
  const pending = record.documents.filter((d) => d.status === "PENDING").length;

  return (
    <li className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left hover:bg-surface-2/60"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">
            {record.businessName || record.name}
            <Badge variant="outline" className="ml-2 align-middle text-[10px]">{ROLE_LABEL[record.role]}</Badge>
          </p>
          <p className="truncate text-xs text-muted-fg">
            {record.businessName ? `${record.name} · ` : ""}
            {record.mobile ?? "no phone"} · {record.email}
          </p>
          <p className="mt-1 text-xs text-muted-fg">
            {record.documents.length} document{record.documents.length === 1 ? "" : "s"}
            {pending > 0 ? ` · ${pending} to review` : ""} · registered {when(record.registeredAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={STAGE_TONE[record.stage]}>{STAGE_LABEL[record.stage]}</Badge>
          <ChevronDown className={cn("size-4 text-muted-fg transition-transform", open && "rotate-180")} aria-hidden />
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          {record.businessAddress && (
            <p className="text-sm text-muted-fg">
              <span className="font-medium text-fg">Address:</span> {record.businessAddress}
            </p>
          )}
          {record.documents.length === 0 ? (
            <p className="text-sm text-muted-fg">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {record.documents.map((d) => (
                <DocumentRow key={`${d.source}-${d.id}`} doc={d} onDecided={onDecided} />
              ))}
            </ul>
          )}
          <Link
            to={`/x-admin/approvals/${record.userId}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            {record.status === "PENDING" ? "Open review to approve or reject" : "Open full review"}
          </Link>
        </div>
      )}
    </li>
  );
}

/**
 * The record of every partner (drivers and businesses) with their details and
 * documents. Decisions are made in Partner approvals; everything a partner
 * submitted is kept and browsable here, whatever its outcome.
 */
export function SuperAdminPartnerDocuments() {
  const { saApi } = useSuperAdminApi();
  const [status, setStatus] = useState<ApprovalBucket | "">("");
  const [type, setType] = useState<ApprovalRole | "">("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const records = useResource<{ items: PartnerRecord[] }>(
    () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      if (term) params.set("q", term);
      return saApi<{ items: PartnerRecord[] }>(`/super-admin/partner-records?${params}`);
    },
    [saApi, status, type, term],
  );

  const items = records.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Partner documents</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Every driver and business with the details and documents they submitted. Approve or reject new registrations in Partner approvals.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_TABS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm",
              status === f.value
                ? "border-teal-700 bg-teal-100 font-medium text-accent-600 dark:border-accent dark:bg-white/10 dark:text-accent"
                : "border-border text-muted-fg hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {TYPES.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              aria-pressed={type === f.value}
              onClick={() => setType(f.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm",
                type === f.value
                  ? "border-teal-700 bg-teal-100 font-medium text-accent-600 dark:border-accent dark:bg-white/10 dark:text-accent"
                  : "border-border text-muted-fg hover:bg-surface-2",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
          <Input
            aria-label="Search partners"
            placeholder="Search name, business, phone or email"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {records.state === "loading" || records.state === "idle" ? (
        <div className="space-y-3" role="status" aria-label="Loading partners">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : records.state === "error" ? (
        <ErrorState onRetry={records.refetch} message="We couldn't load the partner records." />
      ) : items.length === 0 ? (
        <EmptyState icon={<FolderOpen className="size-6 text-muted-fg" />} title="No partners match these filters" />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <RecordCard key={r.userId} record={r} onDecided={records.refetch} />
          ))}
        </ul>
      )}
    </div>
  );
}
