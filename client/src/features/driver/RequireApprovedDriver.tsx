import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { api, endpoints } from "@/api/client";
import { ErrorState } from "@/components/shared/async-states";
import { RouteFallback } from "@/components/shared/route-fallback";
import type { ApplicationStatus } from "./onboarding/onboarding.types";

/**
 * The driver portal (dashboard, requests, earnings...) is for approved drivers.
 * Anyone else, including someone who just signed up, is taken to their
 * application, which shows exactly where it stands. Checked against the server
 * each time the portal opens, so a suspension takes effect on the next visit.
 */
export function RequireApprovedDriver() {
  const [status, setStatus] = useState<ApplicationStatus | "loading" | "error">("loading");

  const check = () => {
    setStatus("loading");
    api
      .get<{ application: { status: ApplicationStatus } }>(endpoints.driverOnboarding.application)
      .then((v) => setStatus(v.application.status))
      .catch(() => setStatus("error"));
  };
  useEffect(check, []);

  if (status === "loading") return <RouteFallback fullScreen />;
  if (status === "error") {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState onRetry={check} message="We couldn't check your driver account. Check your connection and try again." />
      </div>
    );
  }
  if (status !== "APPROVED") return <Navigate to="/driver/onboarding" replace />;
  return <Outlet />;
}
