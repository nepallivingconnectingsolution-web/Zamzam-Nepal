import { useState } from "react";
import { LifeBuoy, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";

interface Ticket {
  id: string;
  subject: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}

const CATEGORIES = [
  { id: "payment", label: "Payment" },
  { id: "trip", label: "Trip" },
  { id: "booking", label: "Booking" },
  { id: "account", label: "Account" },
  { id: "other", label: "Other" },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];

/**
 * Customer support — raise a ticket and track its status. Tickets go
 * straight into the super admin's Disputes queue, so "RESOLVED" here
 * means a real person on the platform team closed it.
 */
export function SupportPage() {
  const tickets = useResource<Ticket[]>(() => api.get(endpoints.support.tickets));
  const [category, setCategory] = useState<Category>("payment");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = description.trim();
    if (trimmed.length < 10) {
      toast.error("Describe your issue in at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(endpoints.support.tickets, { category, description: trimmed });
      setDescription("");
      toast.success("Ticket submitted. Our team will look into it.");
      tickets.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't submit your ticket. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Support" subtitle="Get help with any trip, booking or payment." />

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <LifeBuoy className="size-4 text-muted-fg" />
          <h2 className="font-display text-base font-semibold">Raise a ticket</h2>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">What is this about?</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  category === c.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-fg hover:border-accent/50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="support-description" className="text-sm font-medium">
            Describe the issue
          </label>
          <textarea
            id="support-description"
            rows={4}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell us what happened — trip details, booking reference, amounts…"
            className="flex w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted-fg transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          />
          <p className="text-right text-[11px] text-muted-fg">{description.length}/1000</p>
        </div>

        <Button variant="accent" onClick={submit} disabled={submitting || description.trim().length < 10}>
          {submitting ? "Submitting…" : "Submit ticket"}
        </Button>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Your tickets</h2>
        <Card className="p-2">
          <AsyncBoundary
            state={tickets.state}
            onRetry={tickets.refetch}
            label="Support tickets"
            empty={
              <EmptyState
                icon={<MessageSquareText className="size-6 text-muted-fg" />}
                title="No tickets yet"
                description="Anything you raise will show up here with its status."
              />
            }
          >
            <ul className="divide-y divide-border">
              {(tickets.data ?? []).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-fg">
                      {new Date(t.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Badge variant={t.status === "RESOLVED" ? "success" : "warning"} className="shrink-0 text-[10px]">
                    {t.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          </AsyncBoundary>
        </Card>
      </div>
    </div>
  );
}