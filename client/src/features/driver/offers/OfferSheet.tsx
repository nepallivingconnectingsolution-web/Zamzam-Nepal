import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, MapPin, Navigation, Route } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { npr } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";
import type { OfferView } from "../onboarding/onboarding.types";
import { secondsLeft } from "./sse";

interface Props {
  offers: OfferView[];
  skewMs: number;
  busy: boolean;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
  /** The countdown reached zero: drop the offer locally (the server expires it too). */
  onExpire: (offerId: string) => void;
}

const RING = 2 * Math.PI * 26;

/**
 * One ride offer at a time, soonest-to-expire first. The driver must answer or
 * let it lapse: swiping the sheet away is deliberately not a way to decline.
 */
export function OfferSheet({ offers, skewMs, busy, onAccept, onDecline, onExpire }: Props) {
  const offer = useMemo(
    () => [...offers].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0] ?? null,
    [offers],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!offer) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [offer]);

  // The ring's full length is however long this offer had when it arrived.
  const totalRef = useRef<{ id: string; seconds: number } | null>(null);
  if (offer && totalRef.current?.id !== offer.offerId) {
    totalRef.current = { id: offer.offerId, seconds: Math.max(1, secondsLeft(offer.expiresAt, Date.now(), skewMs)) };
    void haptics.warning();
  }

  const left = offer ? secondsLeft(offer.expiresAt, now, skewMs) : 0;
  useEffect(() => {
    if (offer && left === 0) onExpire(offer.offerId);
  }, [offer, left, onExpire]);

  const total = totalRef.current?.seconds ?? 15;
  const urgent = left <= 5;

  return (
    <BottomSheet open={!!offer && left > 0} onClose={() => undefined} hideChrome>
      {offer && (
        <div className="space-y-5 pt-5" aria-live="assertive">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Badge variant="accent" className="capitalize">{offer.service}</Badge>
              <h2 className="mt-2 font-display text-h1 font-bold">New ride</h2>
              <p className="text-body-sm text-muted-fg">Answer before the timer runs out.</p>
            </div>
            <div
              className="relative grid size-16 shrink-0 place-items-center"
              role="timer"
              aria-label={`${left} seconds left`}
            >
              <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90">
                <circle cx="30" cy="30" r="26" fill="none" strokeWidth="5" className="stroke-surface-2" />
                <circle
                  cx="30" cy="30" r="26" fill="none" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - Math.min(1, left / total))}
                  className={urgent ? "stroke-warning" : "stroke-teal-700 dark:stroke-accent"}
                  style={{ transition: "stroke-dashoffset 250ms linear" }}
                />
              </svg>
              <span className={`font-mono text-h2 font-bold ${urgent ? "text-warning" : ""}`}>{left}</span>
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-surface-2 p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-accent-600" />
              <div className="min-w-0">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-fg">Pickup</p>
                <p className="text-body font-medium">{offer.pickup.label}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Navigation className="mt-0.5 size-4 shrink-0 text-muted-fg" />
              <div className="min-w-0">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-fg">Destination</p>
                <p className="text-body font-medium">{offer.destination.label}</p>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-border p-3">
              <dt className="flex items-center justify-center gap-1 text-caption text-muted-fg"><Route className="size-3.5" /> Trip</dt>
              <dd className="mt-1 font-display text-h2 font-bold">{offer.distanceKm != null ? `${offer.distanceKm} km` : "-"}</dd>
            </div>
            <div className="rounded-xl border border-border p-3">
              <dt className="text-caption text-muted-fg">Estimated fare</dt>
              <dd className="mt-1 font-display text-h2 font-bold">{npr(offer.fare)}</dd>
            </div>
            <div className="rounded-xl border border-border p-3">
              <dt className="flex items-center justify-center gap-1 text-caption text-muted-fg"><Clock className="size-3.5" /> Pickup</dt>
              <dd className="mt-1 font-display text-h2 font-bold">{offer.pickupEtaMin} min</dd>
              <dd className="text-caption text-muted-fg">{offer.pickupDistanceKm} km away</dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" disabled={busy} onClick={() => onDecline(offer.offerId)}>
              Decline
            </Button>
            <Button variant="accent" size="lg" loading={busy} onClick={() => onAccept(offer.offerId)}>
              Accept
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
