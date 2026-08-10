import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  IdCard,
  PartyPopper,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, API_ORIGIN, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";

export type PartnerType = "hotel" | "restaurant" | "grocery" | "bus_operator" | "freight";
type DocumentStatus = "NOT_UPLOADED" | "PENDING" | "APPROVED" | "SUSPENDED";

interface PartnerDocument {
  id: string | null;
  type: string;
  label: string;
  hint: string;
  /** Required documents gate publishing — the server rejects writes without them. */
  required: boolean;
  fileUrl: string | null;
  fileName: string | null;
  status: DocumentStatus;
  reviewNote: string | null;
  updatedAt: string | null;
}

const PORTAL_HOME: Record<PartnerType, string> = {
  hotel: "/hotel",
  restaurant: "/restaurant",
  grocery: "/grocery",
  bus_operator: "/operator",
  freight: "/freight",
};

const PAGE_SUBTITLE: Record<PartnerType, string> = {
  hotel: "Upload your hotel's operating licence, the owner's ID and proof of property ownership for verification.",
  restaurant: "Upload your food business licence, the owner's ID and a health certificate for verification.",
  grocery: "Upload your store's operating licence, the owner's ID and tax registration for verification.",
  bus_operator: "Upload your route permit, the owner's ID and company registration for verification.",
  freight: "Upload your transport licence, the owner's ID and company registration for verification.",
};

function iconForType(type: string): LucideIcon {
  if (type.includes("owner_id")) return IdCard;
  if (type.includes("license") || type.includes("permit")) return FileText;
  if (type.includes("registration")) return Building2;
  if (type.includes("certificate")) return ShieldCheck;
  return FileText;
}

const STATUS_BADGE: Record<DocumentStatus, { variant: "warning" | "success" | "danger" | "outline"; label: string }> = {
  NOT_UPLOADED: { variant: "outline", label: "Not uploaded" },
  PENDING: { variant: "warning", label: "Pending review" },
  APPROVED: { variant: "success", label: "Verified" },
  SUSPENDED: { variant: "danger", label: "Rejected" },
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
const POLL_INTERVAL_MS = 6_000;
const REDIRECT_DELAY_MS = 3_000;

export function PartnerDocumentsPage({ partnerType }: { partnerType: PartnerType }) {
  const documents = useResource<PartnerDocument[]>(() => api.get(endpoints.partnerDocuments.mine));
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [justVerified, setJustVerified] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const navigate = useNavigate();
  const home = PORTAL_HOME[partnerType];

  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = documentsRef.current;
      const hasPending = (current.data ?? []).some((d) => d.status === "PENDING");
      if (hasPending) current.refetch();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  /**
   * Required documents not yet uploaded. A rejected (SUSPENDED) document
   * counts as outstanding — the server treats it the same way, so the banner
   * has to agree with what publishing will actually allow.
   */
  const outstanding = (documents.data ?? []).filter(
    (d) => d.required && (d.status === "NOT_UPLOADED" || d.status === "SUSPENDED"),
  );

  const wasFullyVerifiedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!documents.data) return;
    const allApproved = documents.data.length > 0 && documents.data.every((d) => d.status === "APPROVED");
    if (wasFullyVerifiedRef.current === false && allApproved) {
      setJustVerified(true);
      toast.success("You're verified!", "All your documents have been approved.");
    }
    wasFullyVerifiedRef.current = allApproved;
  }, [documents.data]);

  useEffect(() => {
    if (!justVerified) return;
    const timeout = window.setTimeout(() => navigate(home), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [justVerified, navigate, home]);

  async function handleFile(type: string, file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File too large", "Documents must be 5 MB or smaller.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Unsupported file type", "Upload a JPG, PNG, WEBP or PDF.");
      return;
    }

    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload(endpoints.partnerDocuments.upload(type), formData);
      toast.success("Document uploaded", "It's now pending admin verification.");
      documents.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't upload this document. Try again.");
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" subtitle={PAGE_SUBTITLE[partnerType]} />

      {/* Publishing is blocked server-side until every required document is
          uploaded, so say so here rather than letting the partner discover it
          as a 403 after filling in a whole schedule form. */}
      {outstanding.length > 0 && (
        <Card className="flex items-start gap-3 border-l-4 border-l-warning p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-body font-semibold">
              {outstanding.length} required document{outstanding.length === 1 ? "" : "s"} still needed
            </p>
            <p className="mt-0.5 text-body-sm text-muted-fg">
              You can't publish listings until you upload {outstanding.map((d) => d.label).join(", ")}.
            </p>
          </div>
        </Card>
      )}

      {justVerified && (
        <Card className="flex flex-col items-center gap-3 border-success/30 bg-success/10 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-success/20">
            <PartyPopper className="size-7 text-success" />
          </div>
          <div>
            <p className="text-lg font-semibold">You're verified!</p>
            <p className="mt-1 text-sm text-muted-fg">
              All your documents have been approved. Taking you to your dashboard…
            </p>
          </div>
          <Button variant="accent" size="sm" onClick={() => navigate(home)}>
            Go to dashboard now
          </Button>
        </Card>
      )}

      <AsyncBoundary state={documents.state} onRetry={documents.refetch} label="Your documents">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(documents.data ?? []).map((doc) => {
            const badge = STATUS_BADGE[doc.status];
            const Icon = iconForType(doc.type);
            const isUploading = uploadingType === doc.type;

            return (
              <Card key={doc.type} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                      <Icon className="size-5 text-muted-fg" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {doc.label}
                        {/* Asterisk carries the same meaning it does on any
                            form: this one is mandatory. */}
                        {doc.required && <span className="ml-0.5 text-error" aria-hidden>*</span>}
                      </p>
                      <p className="text-xs text-muted-fg">{doc.hint}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={badge.variant} className="w-fit">
                    {doc.status === "PENDING" && <Clock className="size-3" />}
                    {doc.status === "APPROVED" && <CheckCircle2 className="size-3" />}
                    {doc.status === "SUSPENDED" && <ShieldAlert className="size-3" />}
                    {badge.label}
                  </Badge>
                  <span className="text-caption text-muted-fg">
                    {doc.required ? "Required to publish" : "Optional"}
                  </span>
                </div>

                {doc.status === "SUSPENDED" && doc.reviewNote && (
                  <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{doc.reviewNote}</p>
                )}

                {doc.fileUrl && (
                  <a
                    href={`${API_ORIGIN}${doc.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                  >
                    <Eye className="size-3.5" /> View uploaded file
                  </a>
                )}

                <input
                  ref={(el) => {
                    inputRefs.current[doc.type] = el;
                  }}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    void handleFile(doc.type, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant={doc.fileUrl ? "outline" : "accent"}
                  size="sm"
                  disabled={isUploading}
                  onClick={() => inputRefs.current[doc.type]?.click()}
                  className="mt-auto"
                >
                  <Upload className="size-4" />
                  {isUploading ? "Uploading…" : doc.fileUrl ? "Replace file" : "Upload"}
                </Button>
              </Card>
            );
          })}
        </div>
      </AsyncBoundary>

      <p className="text-xs text-muted-fg">
        Accepted formats: JPG, PNG, WEBP or PDF, up to 5 MB. A super admin reviews each document — re-uploading a
        document resets it to pending review.
      </p>
    </div>
  );
}