import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Calendar, Check, Eye, FileText, Mail, MapPin, Phone, ShieldCheck, ShieldOff, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/stores/toast.store";
import { SuperAdminApiError, useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { Card, ReasonSheet, Row } from "@/features/super-admin/review-parts";
import { ROLE_LABEL, type ApprovalResolution, type BusinessDocument } from "@/features/super-admin/approvals.types";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Business = Extract<ApprovalResolution, { kind: "business" }>;

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", SUSPENDED: "danger" } as const;
const KYC_LABEL = { PENDING: "Pending", APPROVED: "Approved", SUSPENDED: "Rejected" } as const;

const DOC_BADGE: Record<BusinessDocument["status"], { variant: "default" | "warning" | "success" | "danger"; label: string }> = {
  NOT_UPLOADED: { variant: "default", label: "Not uploaded" },
  PENDING: { variant: "warning", label: "Pending review" },
  APPROVED: { variant: "success", label: "Verified" },
  SUSPENDED: { variant: "danger", label: "Rejected" },
};

const QUICK_REASONS = ["Image is unclear.", "The document has expired.", "Details don't match the business.", "This is not the document we asked for."];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Review of a hotel, restaurant, grocery, bus-operator or freight registration:
 * their details, every document with its own decision, and the decision on the
 * business itself. The business can only be approved once each required
 * document is verified, so this page is the whole job.
 */
export function BusinessReview({ data, onChanged }: { data: Business; onChanged: () => void }) {
  const { saApi } = useSuperAdminApi();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | { kind: "rejectDoc"; doc: BusinessDocument } | { kind: "rejectBusiness" } | { kind: "approve" }>(null);

  const { user, documents, gate } = data;
  const title = user.businessName || user.name;
  const undecided = user.kycStatus === "PENDING";

  async function run(success: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      setSheet(null);
      after?.();
    } catch (err) {
      toast.error(err instanceof SuperAdminApiError ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
      onChanged(); // the server is the truth, especially after a 409
    }
  }

  const decideDoc = (doc: BusinessDocument, status: "APPROVED" | "SUSPENDED", reviewNote?: string) =>
    run(status === "APPROVED" ? "Document approved" : "Document rejected", () =>
      saApi(`/super-admin/partner-documents/${doc.id}/verify`, { method: "PATCH", body: reviewNote ? { status, reviewNote } : { status } }),
    );

  const decideBusiness = (kycStatus: "APPROVED" | "SUSPENDED") =>
    run(
      kycStatus === "APPROVED" ? "Business approved" : "Business rejected",
      () => saApi(`/super-admin/users/${user.id}/kyc`, { method: "PATCH", body: { kycStatus } }),
      () => navigate("/x-admin/approvals"),
    );

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <Link to="/x-admin/approvals" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-fg">
        <ArrowLeft className="size-4" /> All approvals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            <Badge variant={STATUS_TONE[user.kycStatus]}>{KYC_LABEL[user.kycStatus]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-fg">{ROLE_LABEL[user.role]} registration</p>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/95 p-3 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
          {user.kycStatus !== "APPROVED" && (
            <Button variant="accent" disabled={!gate.ok || busy} onClick={() => setSheet({ kind: "approve" })}>
              <ShieldCheck className="size-4" /> {undecided ? "Approve business" : "Approve again"}
            </Button>
          )}
          {undecided && (
            <Button variant="danger" disabled={busy} aria-label="Reject business" onClick={() => setSheet({ kind: "rejectBusiness" })}>
              Reject
            </Button>
          )}
          {user.kycStatus === "APPROVED" && (
            <Button variant="outline" disabled={busy} aria-label="Suspend business" onClick={() => setSheet({ kind: "rejectBusiness" })}>
              <ShieldOff className="size-4" /> Suspend
            </Button>
          )}
        </div>
      </div>

      {user.kycStatus !== "APPROVED" && !gate.ok && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold">{gate.message}</p>
            {gate.notUploaded.length > 0 && (
              <p className="mt-1 text-xs text-muted-fg">Still to be uploaded by the business: {gate.notUploaded.join(", ")}.</p>
            )}
          </div>
        </div>
      )}

      <Card title="1. Business details">
        <dl className="divide-y divide-border">
          <Row label="Business name" value={user.businessName} />
          <Row label="Address" value={user.businessAddress && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-muted-fg" />{user.businessAddress}</span>} />
          <Row label="Owner" value={user.name} />
          <Row label="Phone" value={user.mobile && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5 text-muted-fg" />{user.mobile}</span>} />
          <Row label="Email" value={<span className="inline-flex items-center gap-1.5"><Mail className="size-3.5 text-muted-fg" />{user.email}</span>} />
          <Row label="Registered" value={<span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5 text-muted-fg" />{fmt(user.createdAt)}</span>} />
        </dl>
        {!user.businessName && (
          <p className="mt-2 text-xs text-muted-fg">The business hasn't filled in its profile yet.</p>
        )}
      </Card>

      <Card title="2. Documents">
        <ul className="divide-y divide-border">
          {documents.map((d) => {
            const badge = DOC_BADGE[d.status];
            return (
              <li key={d.type} className="flex flex-wrap items-center gap-3 py-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-fg">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {d.label}
                    {d.required ? <span className="ml-1 text-error" aria-label="required">*</span> : <span className="ml-1.5 text-xs font-normal text-muted-fg">Optional</span>}
                  </p>
                  <p className="text-xs text-muted-fg">
                    {d.updatedAt ? `Uploaded ${fmt(d.updatedAt)}` : d.required ? "Missing: the business hasn't uploaded this yet" : "Not provided"}
                  </p>
                  {d.status === "SUSPENDED" && d.reviewNote && <p className="mt-1 text-xs text-error">Reason: {d.reviewNote}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {d.fileUrl && (
                    <a
                      href={`${API_BASE_URL}${d.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-muted-fg hover:bg-surface-2 hover:text-fg"
                      aria-label={`Preview ${d.label}`}
                    >
                      <Eye className="size-4" /> Preview
                    </a>
                  )}
                  {d.id && d.status !== "APPROVED" && (
                    <Button variant="primary" size="sm" disabled={busy} onClick={() => void decideDoc(d, "APPROVED")}>
                      <Check className="size-4" /> Approve
                    </Button>
                  )}
                  {d.id && d.status !== "SUSPENDED" && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setSheet({ kind: "rejectDoc", doc: d })}>
                      <X className="size-4" /> Reject
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <BottomSheet open={sheet?.kind === "approve"} onClose={() => setSheet(null)} title="Approve this business?" description="They can use their portal and publish listings straight away.">
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" size="lg" onClick={() => setSheet(null)} disabled={busy}>Cancel</Button>
          <Button variant="accent" size="lg" loading={busy} onClick={() => void decideBusiness("APPROVED")}>Approve</Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet?.kind === "rejectBusiness"}
        onClose={() => setSheet(null)}
        title={undecided ? "Reject this business?" : "Suspend this business?"}
        description="They will no longer be able to sign in. You can approve them again later."
      >
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" size="lg" onClick={() => setSheet(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" size="lg" loading={busy} onClick={() => void decideBusiness("SUSPENDED")}>
            {undecided ? "Reject" : "Suspend"}
          </Button>
        </div>
      </BottomSheet>

      <ReasonSheet
        open={sheet?.kind === "rejectDoc"}
        onClose={() => setSheet(null)}
        busy={busy}
        title={`Reject ${sheet?.kind === "rejectDoc" ? sheet.doc.label : "document"}`}
        description="The business sees this reason and can upload a new file."
        placeholder="What is wrong with it?"
        shortHint="Give a reason so they know what to fix."
        confirmLabel="Reject document"
        quick={QUICK_REASONS}
        onConfirm={(reason) => sheet?.kind === "rejectDoc" && void decideDoc(sheet.doc, "SUSPENDED", reason)}
      />
    </div>
  );
}
