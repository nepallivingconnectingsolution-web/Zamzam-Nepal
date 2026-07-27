import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarCheck, CheckCheck, Info, RefreshCcw, ShieldAlert, Truck, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";

interface NotificationItem {
  id: string;
  type: "booking_confirmed" | "booking_cancelled" | "refund_processed" | "refund_failed" | "order_update" | "ride_update" | "system";
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
  booking_confirmed: CalendarCheck,
  booking_cancelled: XCircle,
  refund_processed: RefreshCcw,
  refund_failed: ShieldAlert,
  order_update: Truck,
  ride_update: Truck,
  system: Info,
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NP", { day: "numeric", month: "short" });
}

const POLL_MS = 20_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);

  const feed = useResource<NotificationsResponse>(
    () => api.get<NotificationsResponse>(`${endpoints.notifications.list}?limit=8`),
    [],
    { refreshInterval: POLL_MS },
  );

  useEffect(() => {
    const items = feed.data?.items;
    if (!items) return;

    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(items.map((n) => n.id));
      return;
    }

    const fresh = items.filter((n) => !seenIdsRef.current!.has(n.id));
    for (const n of fresh.reverse()) {
      toast.info(n.title, n.message);
      seenIdsRef.current.add(n.id);
    }
  }, [feed.data]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const unread = feed.data?.unread ?? 0;

  async function openNotification(n: NotificationItem) {
    if (!n.isRead) {
      try {
        await api.patch(endpoints.notifications.markRead(n.id));
        feed.refetch();
      } catch {
        // Non-critical — the badge stays accurate on the next poll either way.
      }
    }
  }

  async function markAllRead() {
    try {
      await api.patch(endpoints.notifications.markAllRead);
      feed.refetch();
    } catch {
      toast.error("Couldn't mark all as read", "Please try again.");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-2"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-display text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {feed.state === "loading" || feed.state === "idle" ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="skeleton h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : feed.state === "error" ? (
                <div className="p-6 text-center text-sm text-muted-fg">Couldn't load notifications.</div>
              ) : (feed.data?.items.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <Bell className="size-6 text-muted-fg" />
                  <p className="text-sm font-medium">You're all caught up</p>
                  <p className="text-xs text-muted-fg">Updates on your bookings and orders will show up here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {feed.data!.items.map((n) => {
                    const Icon = TYPE_ICON[n.type];
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                            !n.isRead && "bg-accent/5",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                              n.isRead ? "bg-surface-2 text-muted-fg" : "bg-accent/10 text-accent-600 dark:text-accent",
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold">{n.title}</span>
                              {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                            </span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-fg">{n.message}</span>
                            <span className="mt-1 block text-[11px] text-muted-fg/70">{timeAgo(n.createdAt)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}