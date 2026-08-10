import { Armchair, Bus, Clock, CreditCard, MapPin, Printer, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { QrCode } from "@/components/ui/qr-code";
import type { BusTicket } from "./types";
import { createPortal } from "react-dom";


const statusVariant: Record<BusTicket["status"], "success" | "warning" | "danger" | "accent"> = {
  CONFIRMED: "success",
  PENDING: "warning",
  CANCELLED: "danger",
  COMPLETED: "accent",
};

const PAYMENT_LABELS: Record<string, string> = {
  wallet: "Zamzam Wallet",
  esewa: "eSewa",
  khalti: "Khalti",
  connectips: "ConnectIPS",
  imepay: "IME Pay",
  card: "Card",
  cash: "Cash",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Pure, printable e-ticket layout. Deliberately styled with fixed light
 * colors (bg-white/slate-*) instead of the app's theme tokens (bg-surface,
 * text-fg, etc.) so it always renders as a clean, legible "paper" ticket —
 * on screen and on paper — regardless of whether the customer is in dark
 * mode. Kept under ~1 printed page for the common case (1-4 passengers).
 */
export function BusTicketDocument({ ticket }: { ticket: BusTicket }) {
  const bus = ticket.bus;

  return (
    <div className="w-full bg-white text-slate-900">
      {/* Header. The divider below is the terrain line doing structural work
          — the signature as the ticket's perforation rather than a plain
          dashed rule. See .ticket-divider in globals.css. */}
      <div className="flex items-start justify-between gap-4 pb-4">
        <div>
          <p className="font-display text-lg font-bold tracking-tight text-slate-900">zamzam</p>
          <p className="text-xs text-slate-500">Intercity Bus E-Ticket</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <Badge variant={statusVariant[ticket.status]} className="border border-slate-300">
              {ticket.status}
            </Badge>
            {ticket.bookingRef && (
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{ticket.bookingRef}</p>
            )}
          </div>
          {/* Only a confirmed booking has a real reference worth encoding —
              a "pending" ticket has nothing stable to scan yet. */}
          {ticket.bookingRef && (
            <QrCode value={ticket.bookingRef} size={64} className="shrink-0 rounded border border-slate-200" />
          )}
        </div>
      </div>

      <div className="ticket-divider" aria-hidden />

      {/* Journey details */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operator</p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
            <Bus className="size-4 text-brand-600" /> {bus?.operator ?? "—"}
            {bus?.type ? ` · ${bus.type}` : ""}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Route</p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
            <MapPin className="size-4 text-brand-600" /> {bus?.from ?? "—"} → {bus?.to ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Journey date</p>
          <p className="text-sm font-medium text-slate-900">{bus?.date ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Departure — Arrival
          </p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
            <Clock className="size-4 text-brand-600" /> {bus?.departure ?? "—"} – {bus?.arrival ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Seat(s)</p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
            <Armchair className="size-4 text-brand-600" /> {ticket.seats.join(", ")}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Booked on</p>
          <p className="text-sm font-medium text-slate-900">{formatDateTime(ticket.bookedAt)}</p>
        </div>
      </section>

      {/* Passenger details */}
      <section className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Passenger details
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Seat</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Age</th>
                <th className="px-3 py-2 font-semibold">Gender</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
              </tr>
            </thead>
            <tbody>
              {ticket.passengers.map((p, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                    {ticket.seats[i] ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-900">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{p.age}</td>
                  <td className="px-3 py-2 capitalize text-slate-700">{p.gender}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{p.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payment details + policy */}
      <section className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Payment details
          </p>
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Seat fare</dt>
              <dd className="font-medium text-slate-900 font-tabular">रू {ticket.totalPrice.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Service fee</dt>
              <dd className="font-medium text-slate-900 font-tabular">रू {ticket.serviceFee.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
              <dt className="font-semibold text-slate-900">Grand total</dt>
              <dd className="font-display font-bold text-slate-900 font-tabular">
                रू {ticket.grandTotal.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Payment method</dt>
              <dd className="flex items-center gap-1.5 font-medium text-slate-900">
                <CreditCard className="size-3.5 text-brand-600" />
                {ticket.method ? (PAYMENT_LABELS[ticket.method] ?? ticket.method) : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <ShieldCheck className="size-3.5" /> Cancellation & refund policy
          </p>
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-600">
            <li>Tickets can be cancelled anytime before departure from "My bus tickets."</li>
            <li>Wallet payments are refunded to your Zamzam Wallet instantly on cancellation.</li>
            <li>
              Payments made via eSewa, Khalti, ConnectIPS, IME Pay or card are refunded to the original
              payment method as per that provider's timelines.
            </li>
            <li>No cancellation or refund is possible once the trip has departed or is marked completed.</li>
            <li>Carry a valid government photo ID matching the passenger name(s) on this ticket.</li>
            <li>
              Zamzam Super App facilitates this booking on behalf of the operator; the operator is
              responsible for the journey itself.
            </li>
          </ul>
        </div>
      </section>

      <div className="ticket-divider mt-5" aria-hidden />
      <div className="pt-3 text-center text-[11px] text-slate-400">
        This is a computer-generated e-ticket and does not require a signature. · support@zamzam.com.np ·
        +977-1-4000000
      </div>
    </div>
  );
}

/**
 * Sheet wrapper around BusTicketDocument with Print/Download and Close
 * controls. `ticket` stays whatever it last was while `open` is false, so
 * the sheet can play its close animation instead of unmounting instantly —
 * pass `open={!!ticket}` and keep the last non-null ticket at the call site
 * (or just gate rendering on a separate boolean, as BusBookingsPage/
 * BusDetailPage do).
 *
 * "Download" is implemented via the browser's native print dialog rather
 * than a PDF-generation library: every desktop and mobile browser offers
 * "Save as PDF" as a destination in that dialog, which gives a real,
 * paginated, no-extra-dependency download/print path that works
 * identically on phone, tablet and desktop.
 */
export function BusTicketModal({
  ticket,
  open,
  onClose,
}: {
  ticket: BusTicket | null;
  open: boolean;
  onClose: () => void;
}) {
  const printRoot = document.getElementById("print-root");

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Your e-ticket"
        description="Download or print a copy for your journey."
        className="sm:mx-auto sm:max-w-2xl"
      >
        {ticket && (
          <div className="space-y-4 pb-2">
            <Button variant="accent" className="w-full" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / Download
            </Button>
            <div className="overflow-hidden rounded-2xl border border-border">
              <BusTicketDocument ticket={ticket} />
            </div>
          </div>
        )}
      </BottomSheet>

      {ticket &&
        printRoot &&
        createPortal(
          <div id="bus-ticket-print-area">
            <BusTicketDocument ticket={ticket} />
          </div>,
          printRoot,
        )}
    </>
  );
}