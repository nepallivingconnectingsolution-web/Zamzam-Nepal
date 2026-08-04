import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { ROLE_HOME } from "@/config";
import type { Role } from "@/types";

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

  return <Outlet />;
}