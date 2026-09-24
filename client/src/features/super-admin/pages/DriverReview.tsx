import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Eye, ShieldOff, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/shared/async-states";
import { SecureFile, useBlobUrl } from "@/components/shared/secure-file";
import { useResource } from "@/hooks/useResource";
import { toast } from "@/stores/toast.store";
import { cn } from "@/lib/utils";
import { useSuperAdminApi, SuperAdminApiError } from "@/features/super-admin/useSuperAdminApi";
import { STATUS_LABEL } from "@/features/driver/onboarding/onboarding.types";
import {
  DOC_TONE,
  OPEN_STATUSES,
  STATUS_TONE,
  type AdminRequirement,
  type ApplicationDetail,
  type DocView,
} from "@/features/super-admin/applications.types";
import type { PendingVehicle } from "@/features/super-admin/approvals.types";
import { Card, ReasonSheet, Row } from "@/features/super-admin/review-parts";

const BASE = "/super-admin/driver-applications";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

const ACTION_TEXT: Record<string, string> = {
  SUBMITTED: "Driver submitted the application",
  RESUBMITTED: "Driver resubmitted the application",
  REOPENED: "Driver reopened a rejected application",
  REVIEW_STARTED: "Review started",
  DOCUMENT_APPROVED: "Document approved",
  DOCUMENT_REJECTED: "Document rejected",
  APPLICATION_APPROVED: "Application approved",
  APPLICATION_REJECTED: "Application rejected",
  RESUBMISSION_REQUESTED: "Changes requested from the driver",
  VEHICLE_APPROVED: "Vehicle approved",
  DRIVER_SUSPENDED: "Driver suspended",
  VEHICLE_SUSPENDED: "Vehicle suspended",
  DRIVER_REACTIVATED: "Driver reactivated",
  VEHICLE_REACTIVATED: "Vehicle reactivated",
  AUTO_EXPIRED: "Expired automatically",
};

const QUICK_REASONS = ["Image is unclear.", "The document has expired.", "Details don't match the driver's profile.", "This is not the document we asked for."];

/**
 * The full driver review, rendered inside the approvals review page: profile,
 * licence, identity, vehicle, per-document decisions, notes and timeline.
 * `pendingVehicles` are vehicles added or edited after approval; they wait here
 * for a decision because nothing else in the panel lists them.
 */
export function DriverReview({
  applicationId: id,
  pendingVehicles = [],
  onChanged,
}: {
  applicationId: string;
  pendingVehicles?: PendingVehicle[];
  /** Called after any decision so the parent can refresh what it resolved. */
  onChanged?: () => void;
}) {
  const { saApi, saBlob } = useSuperAdminApi();
  const detail = useResource<ApplicationDetail>(() => saApi<ApplicationDetail>(`${BASE}/${id}`), [saApi, id]);

  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | { kind: "approve" | "reject" | "changes" | "suspend" | "reactivate" | "rejectDoc"; docId?: string; label?: string }>(null);
  const [scope, setScope] = useState<"DRIVER" | "VEHICLE" | "BOTH">("BOTH");
  const [preview, setPreview] = useState<{ fileId: string; name: string; mime: string } | null>(null);
  const [note, setNote] = useState("");

  // Opening an application starts its review (idempotent), then refreshes the status.
  useEffect(() => {
    let live = true;
    saApi(`${BASE}/${id}/start-review`, { method: "POST" })
      .then(() => live && detail.refetch())
      .catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saApi, id]);

  const d = detail.data;
  const loadFile = (fileId: string) => () => saBlob(`/super-admin/files/${fileId}`);

  async function act(success: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      setSheet(null);
    } catch (err) {
      toast.error(err instanceof SuperAdminApiError ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
      detail.refetch(); // the server is the truth, especially after a 409
      onChanged?.();
    }
  }

  if (detail.state === "loading" || detail.state === "idle") {
    return (
      <div className="space-y-4" role="status" aria-label="Loading application">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (detail.state === "error" || !d) {
    return <ErrorState onRetry={detail.refetch} message="We couldn't load this application." />;
  }

  const status = d.application.status;
  const open = OPEN_STATUSES.includes(status);
  const decidable = status === "SUBMITTED" || status === "UNDER_REVIEW";
  const gate = d.approvalGate;
  const reqs = d.requirements;
  const licence = reqs.filter((r) => r.docType.startsWith("licence_"));
  const identity = reqs.filter((r) => r.subject === "DRIVER" && !r.docType.startsWith("licence_"));
  const vehicleDocs = reqs.filter((r) => r.subject === "VEHICLE" && r.kind === "DOCUMENT");
  const photos = reqs.filter((r) => r.subject === "VEHICLE" && r.kind === "PHOTO");
  const history = reqs
    .flatMap((r) => r.history.map((h) => ({ ...h, label: r.label })))
    .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
  const p = d.profile;
  const v = d.vehicle;
  const driverSuspended = status === "SUSPENDED";
  const vehicleSuspended = v?.verificationStatus === "SUSPENDED";

  function DocRow({ r }: { r: AdminRequirement }) {
    const cur = r.current;
    const reviewable = open && cur?.status === "PENDING";
    return (
      <li className="flex flex-wrap items-center gap-3 py-3">
        <SecureFile
          fileKey={cur?.fileId ?? null}
          load={loadFile(cur?.fileId ?? "")}
          mimeType={cur?.mimeType}
          name={cur?.originalName}
          className="size-16"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {cap(r.label)}
            {r.isRequired ? <span className="ml-1 text-error" aria-label="required">*</span> : <span className="ml-1.5 text-xs font-normal text-muted-fg">Optional</span>}
          </p>
          {cur ? (
            <p className="text-xs text-muted-fg">
              Uploaded {fmt(cur.uploadedAt)}{cur.expiryDate ? ` · expires ${cur.expiryDate}` : ""}
            </p>
          ) : (
            <p className="text-xs font-medium text-error">{r.isRequired ? "Missing: the driver hasn't uploaded this yet" : "Not provided"}</p>
          )}
          {cur?.rejectionReason && <p className="mt-1 text-xs text-error">Reason: {cur.rejectionReason}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cur ? <Badge variant={DOC_TONE[cur.status]}>{cur.status === "RESUBMISSION_REQUIRED" ? "NEW FILE NEEDED" : cur.status}</Badge> : r.isRequired ? <Badge variant="danger">MISSING</Badge> : null}
          {cur && (
            <Button variant="ghost" size="sm" onClick={() => setPreview({ fileId: cur.fileId, name: cur.originalName, mime: cur.mimeType })} aria-label={`Preview ${r.label}`}>
              <Eye className="size-4" /> Preview
            </Button>
          )}
          {reviewable && (
            <>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void act("Document approved", () => saApi(`${BASE}/documents/${cur!.id}/approve`, { method: "PATCH" }))}>
                <Check className="size-4" /> Approve
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setSheet({ kind: "rejectDoc", docId: cur!.id, label: r.label })}>
                <X className="size-4" /> Reject
              </Button>
            </>
          )}
        </div>
      </li>
    );
  }

  const list = (rows: AdminRequirement[]) => (rows.length ? <ul className="divide-y divide-border">{rows.map((r) => <DocRow key={r.docType} r={r} />)}</ul> : <p className="text-sm text-muted-fg">Nothing required here.</p>);

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <Link to="/x-admin/approvals" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-fg">
        <ArrowLeft className="size-4" /> All approvals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{p?.legalName || d.driver.name}</h1>
            <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            {d.application.isLegacy && <Badge variant="outline">Approved before onboarding existed</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-fg">
            <span className="font-mono">{d.driver.id}</span> · {d.driver.mobile ?? "no phone"} · {d.driver.email}
          </p>
        </div>

        {/* Decisions */}
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/95 p-3 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
          {decidable && (
            <>
              <Button variant="accent" disabled={!gate.ok || busy} onClick={() => setSheet({ kind: "approve" })}>
                <ShieldCheck className="size-4" /> Approve application
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setSheet({ kind: "changes" })}>Request changes</Button>
              <Button variant="danger" disabled={busy} onClick={() => setSheet({ kind: "reject" })}>Reject</Button>
            </>
          )}
          {status === "APPROVED" && (
            <Button variant="outline" disabled={busy} onClick={() => { setScope("BOTH"); setSheet({ kind: "suspend" }); }}>
              <ShieldOff className="size-4" /> Suspend
            </Button>
          )}
          {(driverSuspended || vehicleSuspended) && (
            <Button variant="accent" disabled={busy} onClick={() => { setScope(driverSuspended && vehicleSuspended ? "BOTH" : driverSuspended ? "DRIVER" : "VEHICLE"); setSheet({ kind: "reactivate" }); }}>
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {decidable && !gate.ok && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold">{gate.message}</p>
            {d.missing.length > 0 && <p className="mt-1 text-xs text-muted-fg">Missing: {d.missing.join(", ")}</p>}
          </div>
        </div>
      )}
      {status === "RESUBMISSION_REQUIRED" && <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-fg">Waiting for the driver to replace the flagged items and resubmit.</p>}
      {d.application.rejectionReason && (status === "REJECTED" || status === "RESUBMISSION_REQUIRED") && (
        <p className="rounded-xl bg-error/10 p-3 text-sm text-error">Reason given: {d.application.rejectionReason}</p>
      )}
      {d.application.suspensionReason && (driverSuspended || vehicleSuspended) && (
        <p className="rounded-xl bg-error/10 p-3 text-sm text-error">Suspended: {d.application.suspensionReason}</p>
      )}

      {status === "APPROVED" && pendingVehicles.length > 0 && (
        <Card title="Vehicles awaiting approval">
          <p className="mb-3 text-sm text-muted-fg">
            The driver added or changed these vehicles after being approved. They stay out of the matching pool until you approve them.
          </p>
          <ul className="divide-y divide-border">
            {pendingVehicles.map((pv) => (
              <li key={pv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {pv.makeModel} <span className="ml-1 font-mono text-xs text-muted-fg">{pv.plateNumber}</span>
                  </p>
                  <p className="text-xs capitalize text-muted-fg">{pv.category.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="accent" size="sm" disabled={busy} onClick={() => void act("Vehicle approved", () => saApi(`/super-admin/vehicles/${pv.id}/verify`, { method: "PATCH", body: { status: "APPROVED" } }))}>
                    <Check className="size-4" /> Approve vehicle
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void act("Vehicle rejected", () => saApi(`/super-admin/vehicles/${pv.id}/verify`, { method: "PATCH", body: { status: "SUSPENDED" } }))}>
                    <X className="size-4" /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="1. Driver profile">
        <div className="flex gap-4">
          <SecureFile fileKey={p?.photoFileId ?? null} load={loadFile(p?.photoFileId ?? "")} mimeType="image/jpeg" name="Profile photo" className="size-24" />
          <dl className="min-w-0 flex-1 divide-y divide-border">
            <Row label="Legal name" value={p?.legalName} />
            <Row label="Date of birth" value={p?.dateOfBirth} />
            <Row label="Gender" value={p?.gender && cap(p.gender)} />
            <Row label="Address" value={[p?.address, p?.city, p?.province].filter(Boolean).join(", ")} />
            <Row label="Emergency contact" value={p?.emergencyContactName ? `${p.emergencyContactName} (${p.emergencyContactPhone ?? ""})` : null} />
            <Row label="Language" value={p?.language === "ne" ? "Nepali" : p?.language === "en" ? "English" : null} />
            <Row label="Phone verified" value={p?.phoneVerifiedAt ? fmt(p.phoneVerifiedAt) : <Badge variant="danger">Not verified</Badge>} />
          </dl>
        </div>
      </Card>

      <Card title="2. Driving licence">
        <dl className="mb-2 divide-y divide-border">
          <Row label="Number" value={p?.licenceNumber} />
          <Row label="Category" value={p?.licenceClass} />
          <Row label="Issued by" value={p?.licenceAuthority} />
          <Row label="Issued" value={p?.licenceIssueDate} />
          <Row label="Expires" value={p?.licenceExpiryDate} />
        </dl>
        {list(licence)}
      </Card>

      <Card title="3. Identity information">{list(identity)}</Card>

      <Card title="4. Vehicle information">
        <dl className="divide-y divide-border">
          <Row label="Type" value={v && cap(v.category)} />
          <Row label="Vehicle" value={v ? [v.make, v.model, v.manufactureYear].filter(Boolean).join(" ") : null} />
          <Row label="Number plate" value={v && <span className="font-mono">{v.plateNumber}</span>} />
          <Row label="Colour" value={v?.color} />
          <Row label="Fuel" value={v?.fuelType && cap(v.fuelType)} />
          <Row label="Body type" value={v?.serviceClass && cap(v.serviceClass)} />
          <Row label="Registered" value={v?.registrationYear} />
          <Row label="Vehicle status" value={v && <Badge variant={v.verificationStatus === "APPROVED" ? "success" : v.verificationStatus === "SUSPENDED" ? "danger" : "warning"}>{v.verificationStatus}</Badge>} />
        </dl>
      </Card>

      <Card title="5. Vehicle documents">{list(vehicleDocs)}</Card>

      <Card title="6. Vehicle photos">
        {photos.length ? <ul className="grid gap-x-6 sm:grid-cols-2 sm:divide-y-0">{photos.map((r) => <div key={r.docType} className="border-b border-border last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0"><DocRow r={r} /></div>)}</ul> : <p className="text-sm text-muted-fg">No photos required yet.</p>}
      </Card>

      <Card title="7. Verification history">
        {history.length === 0 ? (
          <p className="text-sm text-muted-fg">No earlier uploads. Replaced documents appear here with what was decided.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h: DocView & { label: string }) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{cap(h.label)}</p>
                  <p className="text-xs text-muted-fg">Uploaded {fmt(h.uploadedAt)}{h.reviewedAt ? ` · reviewed ${fmt(h.reviewedAt)}` : ""}</p>
                  {h.rejectionReason && <p className="text-xs text-error">Reason: {h.rejectionReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={DOC_TONE[h.status]}>{h.status}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setPreview({ fileId: h.fileId, name: h.originalName, mime: h.mimeType })}><Eye className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="8. Admin notes">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim() || busy) return;
            void act("Note added", async () => { await saApi(`${BASE}/${id}/notes`, { method: "POST", body: { text: note.trim() } }); setNote(""); });
          }}
        >
          <label htmlFor="note" className="sr-only">Add a note</label>
          <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note for other admins. The driver never sees this." className="w-full rounded-md border border-input bg-surface p-3 text-sm focus-visible:border-teal-700 focus-visible:outline-none" />
          <Button type="submit" variant="outline" size="sm" disabled={!note.trim() || busy}>Add note</Button>
        </form>
        {d.notes.length > 0 && (
          <ul className="mt-4 space-y-3">
            {[...d.notes].reverse().map((n) => (
              <li key={n.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                <p>{n.reason}</p>
                <p className="mt-1 text-xs text-muted-fg">{n.adminId} · {fmt(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="9. Application timeline">
        {d.timeline.length === 0 ? (
          <p className="text-sm text-muted-fg">Nothing has happened yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-border pl-4">
            {[...d.timeline].reverse().map((t) => (
              <li key={t.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-teal-700 dark:bg-accent" aria-hidden />
                <p className="font-medium">{ACTION_TEXT[t.action] ?? t.action}{t.fromStatus && t.toStatus && t.targetType === "APPLICATION" ? ` (${t.fromStatus.toLowerCase().replace(/_/g, " ")} to ${t.toStatus.toLowerCase().replace(/_/g, " ")})` : ""}</p>
                {t.reason && <p className="text-muted-fg">{t.reason}</p>}
                <p className="text-xs text-muted-fg">{t.adminId ? `Admin ${t.adminId}` : t.action === "AUTO_EXPIRED" ? "System" : "Driver"} · {fmt(t.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Preview */}
      <BottomSheet open={!!preview} onClose={() => setPreview(null)} title={preview?.name}>
        {preview && <FilePreview fileId={preview.fileId} mime={preview.mime} load={loadFile(preview.fileId)} />}
      </BottomSheet>

      {/* Decisions */}
      <BottomSheet open={sheet?.kind === "approve"} onClose={() => setSheet(null)} title="Approve this driver?" description="The driver and their vehicle are approved and the driver can go online right away.">
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" size="lg" onClick={() => setSheet(null)} disabled={busy}>Cancel</Button>
          <Button variant="accent" size="lg" loading={busy} onClick={() => void act("Driver approved", () => saApi(`${BASE}/${id}/approve`, { method: "POST", body: { expectedVersion: d.application.version } }))}>
            Approve
          </Button>
        </div>
      </BottomSheet>

      <ReasonSheet
        open={sheet?.kind === "rejectDoc"} onClose={() => setSheet(null)} busy={busy}
        title={`Reject ${sheet?.label ?? "document"}`} description="The driver sees this reason and can upload a new file."
        placeholder="What is wrong with it?" confirmLabel="Reject document" quick={QUICK_REASONS}
        onConfirm={(reason) => void act("Document rejected", () => saApi(`${BASE}/documents/${sheet!.docId}/reject`, { method: "PATCH", body: { reason } }))}
      />
      <ReasonSheet
        open={sheet?.kind === "changes"} onClose={() => setSheet(null)} busy={busy}
        title="Request changes" description="Sends the application back to the driver. Rejected documents are listed for them automatically."
        placeholder="Anything else the driver should know (optional)" confirmLabel="Send to driver" required={false} tone="primary"
        onConfirm={(reason) => void act("Changes requested", () => saApi(`${BASE}/${id}/request-resubmission`, { method: "POST", body: reason ? { reason } : {} }))}
      />
      <ReasonSheet
        open={sheet?.kind === "reject"} onClose={() => setSheet(null)} busy={busy}
        title="Reject application" description="Use this when the application can't be approved. The driver can correct it and apply again."
        placeholder="Why is it being rejected?" confirmLabel="Reject application"
        onConfirm={(reason) => void act("Application rejected", () => saApi(`${BASE}/${id}/reject`, { method: "POST", body: { reason } }))}
      />
      <ReasonSheet
        open={sheet?.kind === "suspend"} onClose={() => setSheet(null)} busy={busy}
        title="Suspend" description="A suspended driver is taken offline immediately. A trip in progress is not cancelled: support is alerted."
        placeholder="Why is this account being suspended?" confirmLabel="Suspend"
        onConfirm={(reason) => void act("Suspended", () => saApi(`${BASE}/${id}/suspend`, { method: "POST", body: { scope, reason } }))}
      >
        <SegmentedControl options={[{ value: "DRIVER", label: "Driver" }, { value: "VEHICLE", label: "Vehicle" }, { value: "BOTH", label: "Both" }]} value={scope} onChange={setScope} />
      </ReasonSheet>
      <BottomSheet open={sheet?.kind === "reactivate"} onClose={() => setSheet(null)} title="Reactivate" description="They can go online again straight away.">
        <div className="space-y-4 pt-2">
          <SegmentedControl options={[{ value: "DRIVER", label: "Driver" }, { value: "VEHICLE", label: "Vehicle" }, { value: "BOTH", label: "Both" }]} value={scope} onChange={setScope} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={() => setSheet(null)} disabled={busy}>Cancel</Button>
            <Button variant="accent" size="lg" loading={busy} onClick={() => void act("Reactivated", () => saApi(`${BASE}/${id}/reactivate`, { method: "POST", body: { scope } }))}>Reactivate</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function FilePreview({ fileId, mime, load }: { fileId: string; mime: string; load: () => Promise<Blob> }) {
  const { url, state } = useBlobUrl(fileId, load);
  if (state === "error") return <p className="p-6 text-center text-sm text-error">Couldn't load this file.</p>;
  if (!url) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-3">
      {mime === "application/pdf" ? (
        <iframe src={url} title="Document preview" className={cn("h-[65vh] w-full rounded-lg border border-border")} />
      ) : (
        <img src={url} alt="Document preview" className="mx-auto max-h-[65vh] rounded-lg object-contain" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline dark:text-accent">
        <ExternalLink className="size-4" /> Open in a new tab
      </a>
    </div>
  );
}
