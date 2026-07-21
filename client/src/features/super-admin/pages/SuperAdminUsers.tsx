import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UserX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";

interface UserRow {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  kycStatus: string;
  createdAt: string;
}

interface UsersResponse {
  items: UserRow[];
  total: number;
}

export function SuperAdminUsers() {
    const navigate = useNavigate();
  const { saApi } = useSuperAdminApi();
  const [search, setSearch] = useState("");

  const users = useResource<UsersResponse>(
    () =>
      saApi<UsersResponse>(
        `/super-admin/users?limit=50${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
    [search],
  );

  const kycVariant = (s: string): "success" | "danger" | "outline" =>
    s === "APPROVED" ? "success" : s === "SUSPENDED" ? "danger" : "outline";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="All accounts across the Zamzam ecosystem."
      />

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Search name, mobile, email…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <AsyncBoundary
          state={users.state}
          onRetry={users.refetch}
          label="Users"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<UserX className="size-6 text-muted-fg" />}
                title="No users found"
                description="Try adjusting your search."
              />
            </div>
          }
        >
          {/* Desktop / tablet: full table */}
<div className="hidden overflow-x-auto md:block">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
        <th className="px-5 py-3">Name</th>
        <th className="px-5 py-3">Mobile</th>
        <th className="px-5 py-3">Role</th>
        <th className="px-5 py-3">KYC</th>
        <th className="px-5 py-3">Joined</th>
        <th className="px-5 py-3">Actions</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      {(users.data?.items ?? []).map((u) => (
        <tr key={u.id} className="transition-colors hover:bg-surface-2/50">
          <td className="px-5 py-3">
            <p className="font-medium">{u.name}</p>
            {u.email && <p className="text-xs text-muted-fg">{u.email}</p>}
          </td>
          <td className="px-5 py-3 text-muted-fg">{u.mobile}</td>
          <td className="px-5 py-3">
            <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
          </td>
          <td className="px-5 py-3">
            <Badge variant={kycVariant(u.kycStatus)} className="text-[10px]">{u.kycStatus}</Badge>
          </td>
          <td className="px-5 py-3 text-xs text-muted-fg">
            {new Date(u.createdAt).toLocaleDateString("en-NP")}
          </td>
          <td className="px-5 py-3">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate(`/x-admin/registrations/${u.id}`)}>
              View
            </Button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  {users.data && (
    <p className="border-t border-border px-5 py-3 text-xs text-muted-fg">
      Showing {users.data.items.length} of {users.data.total} users
    </p>
  )}
</div>

{/* Mobile: one card per user instead of a cramped, horizontally-scrolling table */}
<div className="space-y-3 p-4 md:hidden">
  {(users.data?.items ?? []).map((u) => (
    <div key={u.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{u.name}</p>
          {u.email && <p className="truncate text-xs text-muted-fg">{u.email}</p>}
          <p className="mt-0.5 text-xs text-muted-fg">{u.mobile}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => navigate(`/x-admin/registrations/${u.id}`)}>
          View
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
        <Badge variant={kycVariant(u.kycStatus)} className="text-[10px]">{u.kycStatus}</Badge>
        <span className="text-xs text-muted-fg">Joined {new Date(u.createdAt).toLocaleDateString("en-NP")}</span>
      </div>
    </div>
  ))}
  {users.data && (
    <p className="pt-1 text-xs text-muted-fg">
      Showing {users.data.items.length} of {users.data.total} users
    </p>
  )}
</div>
        </AsyncBoundary>
      </Card>
    </div>
  );
}