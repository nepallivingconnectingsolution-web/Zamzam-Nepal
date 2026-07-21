import { Navigate, Outlet } from "react-router-dom";
import { useSuperAdminStore } from "@/stores/super-admin.store";

export function SuperAdminGuard() {
  const { isAuthenticated } = useSuperAdminStore();
  if (!isAuthenticated) return <Navigate to="/x-admin/login" replace />;
  return <Outlet />;
}