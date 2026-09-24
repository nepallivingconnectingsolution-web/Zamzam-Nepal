import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { SuperAdminApiError, useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import type { ApprovalResolution } from "@/features/super-admin/approvals.types";
import { BusinessReview } from "@/features/super-admin/pages/BusinessReview";
import { DriverReview } from "@/features/super-admin/pages/DriverReview";

/**
 * /x-admin/approvals/:userId: the single review screen. The server says whether
 * this registration is a driver (full application review) or a business (details,
 * documents and decision), and this renders the right one.
 */
export function SuperAdminReview() {
  const { userId = "" } = useParams();
  const { saApi } = useSuperAdminApi();
  const resolved = useResource<ApprovalResolution>(
    () => saApi<ApprovalResolution>(`/super-admin/approvals/${userId}`),
    [saApi, userId],
  );

  if (resolved.state === "loading" || resolved.state === "idle") {
    return (
      <div className="space-y-4" role="status" aria-label="Loading registration">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (resolved.state === "error" || !resolved.data) {
    const notFound = resolved.error instanceof SuperAdminApiError && resolved.error.status === 404;
    return (
      <div className="space-y-5">
        <Link to="/x-admin/approvals" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-fg">
          <ArrowLeft className="size-4" /> All approvals
        </Link>
        {notFound ? (
          <EmptyState
            title="Nothing to review here"
            description={resolved.error?.message ?? "This account isn't a driver or business registration."}
          />
        ) : (
          <ErrorState onRetry={resolved.refetch} message="We couldn't load this registration." />
        )}
      </div>
    );
  }

  const r = resolved.data;
  return r.kind === "driver" ? (
    <DriverReview applicationId={r.applicationId} pendingVehicles={r.pendingVehicles} onChanged={resolved.refetch} />
  ) : (
    <BusinessReview data={r} onChanged={resolved.refetch} />
  );
}
