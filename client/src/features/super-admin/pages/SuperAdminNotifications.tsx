import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Building2, CheckCheck, Info, RefreshCcw, ShieldAlert, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: "partner_registration" | "business_created" | "dispute_filed" | "refund_pending" | "system";
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
}

const TYPE_ICON: Record<NotificationItem["type"], LucideIcon> = {
  partner_registration: UserPlus,
  business_created: Building2,
  dispute_filed: ShieldAlert,
  refund_pending: RefreshCcw,
  system: Info,
};

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NP", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SuperAdminNotifications() {
  const { saApi } = useSuperAdminApi();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<NotificationItem[]>([]);

  const feed = useResource<NotificationsResponse>(
    () => saApi<NotificationsResponse>(`/super-admin/notifications?limit=${PAGE_SIZE}&offset=${offset}`),
    [offset],
  );

  useEffect(() => {
    if (!feed.data) return;
    setAllItems((prev) => (offset === 0 ? feed.data!.items : [...prev, ...feed.data!.items]));
  }, [feed.data, offset]);

  const total = feed.data?.total ?? 0;
  const unread = feed.data?.unread ?? 0;
  const hasMore = allItems.length < total;

  const refreshFromStart = useCallback(() => {
    if (offset === 0) feed.refetch();
    else setOffset(0);
  }, [offset, feed]);

  async function markAllRead() {
    try {
      await saApi("/super-admin/notifications/read-all", { method: "PATCH" });
      setAllItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshFromStart();
    } catch {
      toast.error("Couldn't mark all as read", "Please try again.");
    }
  }

  async function openNotification(n: NotificationItem) {
    if (!n.isRead) {
      setAllItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      try {
        await saApi(`/super-admin/notifications/${n.id}/read`, { method: "PATCH" });
      } catch {
        // Non-critical — a stale read state self-corrects on next load.
      }
    }
    if (n.entityType === "partner" && n.entityId) {
      navigate(`/x-admin/partners/${n.entityId}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Partner sign-ups, new businesses, and other platform events."
        actions={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="size-4" /> Mark all read ({unread})
            </Button>
          ) : undefined
        }
      />

      <Card>
        {offset === 0 && (feed.state === "loading" || feed.state === "idle") ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : offset === 0 && feed.state === "error" ? (
          <EmptyState
            className="border-none"
            icon={<Bell className="size-6 text-danger" />}
            title="Couldn't load this"
            description="The request didn't go through. Check your connection and try again."
            action={
              <Button variant="outline" size="sm" onClick={feed.refetch}>
                Try again
              </Button>
            }
          />
        ) : allItems.length === 0 ? (
          <EmptyState
            className="border-none"
            icon={<Bell className="size-6 text-muted-fg" />}
            title="You're all caught up"
            description="New partner and business activity will show up here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {allItems.map((n) => {
              const Icon = TYPE_ICON[n.type];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      "flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2",
                      !n.isRead && "bg-accent/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-10 shrink-0 place-items-center rounded-full",
                        n.isRead ? "bg-surface-2 text-muted-fg" : "bg-accent/10 text-accent-600 dark:text-accent",
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{n.title}</span>
                        {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-fg">{n.message}</span>
                      <span className="mt-1.5 block text-xs text-muted-fg/70">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={feed.state === "loading"}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}