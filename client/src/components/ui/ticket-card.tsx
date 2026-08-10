import * as React from "react";
import { cn } from "@/lib/utils";

export interface TicketCardProps {
  /** Main content — route, hotel name, order summary, whatever the "ticket" is for. */
  children: React.ReactNode;
  /** Stub content below the perforation — price, QR code, booking reference. */
  stub?: React.ReactNode;
  className?: string;
}

/**
 * Zamzam's signature receipt/ticket shape — a torn-perforation divider
 * between the main details and a "stub" section, used for booking
 * confirmations, bus/event tickets, ride receipts, wallet top-up receipts.
 * Reserve for confirmation/receipt moments only; it's an identity marker,
 * not a general card style.
 *
 * The bite-mark circles are two absolutely-positioned elements colored to
 * match the page background (not the card), so they read as true cutouts
 * regardless of what's behind the card.
 */
export function TicketCard({ children, stub, className }: TicketCardProps) {
  return (
    <div className={cn("relative overflow-visible rounded-2xl border border-border bg-card shadow-e2", className)}>
      <div className="p-5">{children}</div>

      {stub && (
        <>
          <div className="relative mx-5">
            <div className="ticket-divider" />
            <span className="absolute left-[-1.625rem] top-1/2 size-5 -translate-y-1/2 rounded-full bg-bg" />
            <span className="absolute right-[-1.625rem] top-1/2 size-5 -translate-y-1/2 rounded-full bg-bg" />
          </div>
          <div className="p-5 pt-4">{stub}</div>
        </>
      )}
    </div>
  );
}
