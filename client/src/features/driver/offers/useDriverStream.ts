import { useCallback, useEffect, useRef, useState } from "react";
import { API_ORIGIN, api, endpoints } from "@/api/client";
import type { OfferView } from "../onboarding/onboarding.types";
import { parseSse } from "./sse";

export interface StreamHandlers {
  /** The server took the driver offline (suspension, expiry...). */
  onStatus?: (data: { online: boolean; reason?: string }) => void;
  /** The rider cancelled a trip this driver had already accepted. */
  onRideCancelled?: (rideId: string) => void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const POLL_MS = 5000;

const token = () => {
  try {
    return sessionStorage.getItem("zz_token");
  } catch {
    return null;
  }
};

/**
 * Live ride offers for an online driver. Uses server-sent events (fetch-based,
 * so the auth header works), reconnects with backoff, and while disconnected
 * polls /driver/offers/pending so an offer is never missed. `skewMs` is the
 * server clock minus the device clock, for an accurate countdown.
 */
export function useDriverStream(enabled: boolean, handlers: StreamHandlers = {}) {
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [connected, setConnected] = useState(false);
  const [skewMs, setSkewMs] = useState(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const add = useCallback((offer: OfferView) => {
    setOffers((prev) => (prev.some((o) => o.offerId === offer.offerId) ? prev : [...prev, offer]));
  }, []);
  const dismiss = useCallback((offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.offerId !== offerId));
  }, []);
  const dismissRide = useCallback((rideId: string) => {
    setOffers((prev) => prev.filter((o) => o.rideId !== rideId));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOffers([]);
      setConnected(false);
      return;
    }

    const abort = new AbortController();
    let stopped = false;
    let attempt = 0;
    let pollTimer: number | undefined;

    const poll = async () => {
      try {
        setOffers(await api.get<OfferView[]>(endpoints.driverOnboarding.offersPending));
      } catch {
        // offline or expired session: the next tick (or the stream) recovers
      }
    };
    const startPolling = () => {
      if (pollTimer === undefined) pollTimer = window.setInterval(poll, POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const dispatch = (event: string, raw: string) => {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (event === "offer") add(data as OfferView);
      else if (event === "offer_cancelled") dismissRide((data as { rideId: string }).rideId);
      else if (event === "ride_cancelled") handlersRef.current.onRideCancelled?.((data as { rideId: string }).rideId);
      else if (event === "status") handlersRef.current.onStatus?.(data as { online: boolean; reason?: string });
    };

    async function connect() {
      while (!stopped) {
        try {
          // A cheap authenticated call first: it refreshes an expired access token,
          // which the raw stream request below cannot do by itself.
          await poll();
          const res = await fetch(`${API_ORIGIN}${endpoints.driverOnboarding.stream}`, {
            headers: { Accept: "text/event-stream", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
            signal: abort.signal,
            cache: "no-store",
          });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

          const serverDate = Date.parse(res.headers.get("date") ?? "");
          if (!Number.isNaN(serverDate)) setSkewMs(serverDate - Date.now());

          setConnected(true);
          stopPolling();
          attempt = 0;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSse(buffer);
            buffer = parsed.rest;
            for (const e of parsed.events) dispatch(e.event, e.data);
          }
        } catch {
          if (stopped) return;
        }
        setConnected(false);
        startPolling();
        const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        attempt += 1;
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    void connect();
    return () => {
      stopped = true;
      abort.abort();
      stopPolling();
      setConnected(false);
    };
  }, [enabled, add, dismissRide]);

  return { offers, connected, skewMs, dismiss };
}
