import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, Eye, FileText, IdCard, PartyPopper, ShieldAlert, Upload } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, API_ORIGIN, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";

type DocumentType = "citizenship" | "license" | "nid";
type DocumentStatus = "NOT_UPLOADED" | "PENDING" | "APPROVED" | "SUSPENDED";

interface DriverDocument {
  id: string | null;
  type: DocumentType;
  label: string;
  fileUrl: string | null;
  fileName: string | null;
  status: DocumentStatus;
  reviewNote: string | null;
  updatedAt: string | null;
}

const ICONS: Record<DocumentType, typeof IdCard> = {
  citizenship: FileText,
  license: IdCard,
  nid: IdCard,
};

const HINTS: Record<DocumentType, string> = {
  citizenship: "A clear photo or scan of your citizenship certificate.",
  license: "Your valid driving license, front side visible.",
  nid: "Your national ID card, front side visible.",
};

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

export function DriverDocumentsPage() {
  const documents = useResource<DriverDocument[]>(() => api.get(endpoints.driverDocuments.mine));
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [justVerified, setJustVerified] = useState(false);
  const inputRefs = useRef<Partial<Record<DocumentType, HTMLInputElement | null>>>({});
  const navigate = useNavigate();

  // Keep a ref mirroring the latest resource so the polling interval below
  // (set up once) always reads fresh state without needing to be torn down
  // and recreated every time documents.data changes.
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  // Background poll: an admin can approve/reject from a totally separate
  // session, so the driver has no other signal that anything changed.
  // Only bothers refetching while something is actually still PENDING.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = documentsRef.current;
      const hasPending = (current.data ?? []).some((d) => d.status === "PENDING");
      if (hasPending) current.refetch();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  // Detects the *transition* into "every document approved" (not just being
  // in that state on first load) so revisiting an already-verified page
  // doesn't retrigger the celebration + redirect.
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
    const timeout = window.setTimeout(() => navigate("/driver"), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [justVerified, navigate]);

  async function handleFile(type: DocumentType, file: File | undefined) {
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
      await api.upload(endpoints.driverDocuments.upload(type), formData);
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
      <PageHeader
        title="Documents"
        subtitle="Upload your citizenship certificate, driving license and national ID for verification."
      />

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
          <Button variant="accent" size="sm" onClick={() => navigate("/driver")}>
            Go to dashboard now
          </Button>
        </Card>
      )}

      <AsyncBoundary state={documents.state} onRetry={documents.refetch} label="Your documents">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(documents.data ?? []).map((doc) => {
            const badge = STATUS_BADGE[doc.status];
            const Icon = ICONS[doc.type];
            const isUploading = uploadingType === doc.type;

            return (
              <Card key={doc.type} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                      <Icon className="size-5 text-muted-fg" />
                    </div>
                    <div>
                      <p className="font-medium">{doc.label}</p>
                      <p className="text-xs text-muted-fg">{HINTS[doc.type]}</p>
                    </div>
                  </div>
                </div>

                <Badge variant={badge.variant} className="w-fit">
                  {doc.status === "PENDING" && <Clock className="size-3" />}
                  {doc.status === "APPROVED" && <CheckCircle2 className="size-3" />}
                  {doc.status === "SUSPENDED" && <ShieldAlert className="size-3" />}
                  {badge.label}
                </Badge>

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
        Accepted formats: JPG, PNG, WEBP or PDF, up to 5 MB. An admin reviews each document — re-uploading a
        document resets it to pending review.
      </p>
    </div>
  );
}