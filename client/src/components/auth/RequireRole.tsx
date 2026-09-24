import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { ROLE_HOME } from "@/config";
import type { Role } from "@/types";

/** Business partners who sign in before approval, to upload documents (drivers have their own onboarding). */
export const BUSINESS_ROLES: readonly Role[] = ["hotel", "restaurant", "grocery", "bus_operator", "freight"];

/**
 * Gate for the role-specific portals (/app, /driver, /operator, /freight,
 * /hotel, /admin). Renders the portal only if the user's REAL authenticated
 * role (from the JWT-issued session) matches the portal's role.
 *
 * Without this, a session could land on a portal it has no backend access
 * to (e.g. via the demo "Preview as" role switcher, a stale link, or a
 * mismatched login pick) — the page would render fine, then every
 * role-gated API call would 403, because the RolesGuard on the server
 * checks the token's real role, not whichever portal happens to be open.
 *
 * It also keeps a business partner that is still awaiting approval out of its
 * portal: it is sent to /verification to upload documents instead.
 */
export function RequireRole({ role }: { role: Exclude<Role, "guest"> }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== role) {
    // Signed in, just not as this portal's role — send them home instead
    // of leaving them on a page where every request will fail.
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  // A business that isn't approved yet has no portal to look at: it can only
  // fill in its details and upload documents. The server refuses everything
  // else for it (PARTNER_NOT_APPROVED), so this just avoids sending it there.
  if (BUSINESS_ROLES.includes(user.role) && user.kycStatus === "PENDING") {
    return <Navigate to="/verification" replace />;
  }

  return <Outlet />;
}