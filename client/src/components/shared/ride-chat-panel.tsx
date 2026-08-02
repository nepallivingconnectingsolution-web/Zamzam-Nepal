import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

export interface RideMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: "customer" | "driver";
  body: string;
  createdAt: string;
}

/**
 * In-trip chat thread, shared by the customer's ServiceBookingPage and the
 * driver's CurrentTripPage. Polls GET /rides/:id/messages every 3s while
 * open — this codebase has no websocket/socket.io infrastructure anywhere
 * (location broadcast, notifications, everything real-time here is
 * polling), so the chat follows the same established pattern instead of
 * introducing a new one. Opening the thread also marks the other side's
 * messages read server-side, which is what clears the unread badge on the
 * Chat button once the person actually looks.
 */
export function RideChatPanel({
  rideId,
  otherPartyName,
  onClose,
}: {
  rideId: string;
  otherPartyName: string;
  onClose: () => void;
}) {
  const myId = useAuthStore((s) => s.user?.id);
  const thread = useResource<RideMessage[]>(() => api.get(endpoints.rides.messages(rideId)), [rideId], {
    refreshInterval: 3000,
  });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread.data]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    try {
      await api.post(endpoints.rides.messages(rideId), { body });
      thread.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send that message. Try again.");
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  const messages = thread.data ?? [];

  return (
    <Card className="flex h-96 flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border p-3">
        <p className="text-sm font-semibold">Chat with {otherPartyName}</p>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close chat">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {thread.state === "loading" ? (
          <p className="py-8 text-center text-xs text-muted-fg">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-fg">
            No messages yet — say hello to {otherPartyName}.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === myId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-accent text-white" : "bg-surface-2 text-fg",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-0.5 text-right text-[10px]", mine ? "text-white/70" : "text-muted-fg")}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <Button type="submit" size="icon" variant="accent" disabled={sending || !draft.trim()} aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </form>
    </Card>
  );
}