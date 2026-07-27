import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";

export interface SeriesPoint {
  label: string;
  value: number;
}
export interface Earnings {
  today: number;
  week: number;
  tripsToday: number;
  currency: string;
  series: SeriesPoint[];
  online: boolean;
}
export interface IncomingRequest {
  id: string;
  service: string;
  from: string;
  to: string;
  fare: number;
  pickupKm: number | null;
  etaMin: number | null;
  parcelWeightKg: number | null;
}
export interface CurrentJob {
  id: string;
  service: string;
  from: string;
  to: string;
  fare: number;
  status: "ACCEPTED" | "ONGOING" | "PAYMENT_PENDING";
  customerName: string | null;
  customerMobile: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
}

/**
 * Snapshot of the trip that just settled, kept client-side so the driver
 * gets an Uber-style earnings recap even though /rides/current returns null
 * the moment the fare settles.
 */
export interface CompletedTrip {
  id: string;
  service: string;
  from: string;
  to: string;
  fare: number;
  method: "cash" | "wallet";
}

interface DriverPortalState {
  online: boolean;
  toggling: boolean;
  broadcasting: boolean;
  /** The driver's own last-known GPS fix, captured by the same ping that broadcasts it. */
  myLocation: { lat: number; lng: number } | null;
  toggleOnline: () => void;
  earnings: ReturnType<typeof useResource<Earnings>>;
  requests: ReturnType<typeof useResource<IncomingRequest[]>>;
  job: ReturnType<typeof useResource<CurrentJob | null>>;
  rating: ReturnType<typeof useResource<RatingSummary>>;
  actionBusy: string | null;
  acceptRequest: (id: string) => void;
  advanceJob: (current: CurrentJob) => void;
  settleCash: (current: CurrentJob) => void;
  lastTrip: CompletedTrip | null;
  clearLastTrip: () => void;
}

const DriverPortalContext = createContext<DriverPortalState | null>(null);

/**
 * Mounted once at the /driver route root (see routes/index.tsx) so that
 * going online, the GPS broadcast loop, and the incoming-requests /
 * current-job polling all keep running no matter which driver page is
 * open. Previously this lived entirely inside DriverDashboard.tsx, which
 * meant navigating to Ride requests / Current trip / Earnings unmounted
 * the effect and silently stopped the location ping — after 5 minutes the
 * driver would drop out of nearby matching without any visible error.
 */
export function DriverPortalProvider() {
  const navigate = useNavigate();
  const earnings = useResource<Earnings>(() => api.get(endpoints.driver.earnings), [], {
    refreshInterval: 15000,
  });
  const requests = useResource<IncomingRequest[]>(() => api.get(endpoints.driver.requests), [], {
    refreshInterval: 8000,
  });
 const rawJob = useResource<CurrentJob | null>(() => api.get(endpoints.rides.current), [], {
    refreshInterval: 8000,
  });
  const rating = useResource<RatingSummary>(() => api.get(endpoints.driver.reviewSummary));

const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const geoWarned = useRef(false);

  // ── Post-trip recap state ────────────────────────────────────────────────
  // lastTrip powers the "You earned Rs X — find next ride" recap screen.
  // settledIdRef remembers which ride we already produced a recap for, so
  // the wallet-detection effect below and settleCash() never double-fire on
  // the same trip (settleCash sets it first; the effect then skips).
  const [lastTrip, setLastTrip] = useState<CompletedTrip | null>(null);
  const settledIdRef = useRef<string | null>(null);
  const prevJobRef = useRef<CurrentJob | null>(null);

  // The single place a settled ride is erased from the UI. After settleCash()
  // (or the wallet race), /rides/current can keep returning the old job for
  // one poll cycle — or indefinitely if the background refetch fails (e.g.
  // the server restarts), because useResource intentionally keeps
  // last-known-good data on a failed background refresh. Masking by
  // settledIdRef means the dashboard card, the trip page, and anything else
  // reading `job` drops the settled ride the instant it settles, no matter
  // what the network does.
  const job: typeof rawJob =
    rawJob.data && rawJob.data.id === settledIdRef.current
      ? { ...rawJob, data: null, state: "empty" }
      : rawJob;

  // Detect the customer settling from their wallet: the job we were polling
  // was PAYMENT_PENDING and has now vanished from /rides/current without the
  // driver tapping "Cash collected". Snapshot it into lastTrip so the driver
  // still gets their recap, and refresh earnings — the fare just landed.
  useEffect(() => {
    if (job.state === "idle" || job.state === "loading") return;
    const prev = prevJobRef.current;
    if (prev && prev.status === "PAYMENT_PENDING" && !job.data && settledIdRef.current !== prev.id) {
      settledIdRef.current = prev.id;
      setLastTrip({ id: prev.id, service: prev.service, from: prev.from, to: prev.to, fare: prev.fare, method: "wallet" });
      toast.success("Fare received", "The customer paid from their Zamzam wallet.");
      earnings.refetch();
    }
    prevJobRef.current = job.data ?? null;
    // earnings is a stable resource object from useResource; job.data drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.data, job.state]);

  // The server is the source of truth for online status (earnings returns
  // it), so a page reload — or a fresh mount from a different driver page —
  // resumes correctly instead of silently showing offline.
  useEffect(() => {
    if (earnings.data) setOnline(earnings.data.online);
  }, [earnings.data]);

  // Broadcast GPS position every 15s while online. Runs at the portal root,
  // so it survives navigation between driver pages.
  useEffect(() => {
    if (!online) {
      setBroadcasting(false);
      return;
    }
    let cancelled = false;

    const ping = () => {
      if (!("geolocation" in navigator)) {
        if (!geoWarned.current) {
          geoWarned.current = true;
          toast.error("This browser has no location support — customers can't find you.");
        }
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          // Captured locally regardless of whether the broadcast POST below
          // succeeds — the driver's own map should still track their real
          // position even during a brief network hiccup.
          setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          try {
            await api.post(endpoints.driver.location, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            if (!cancelled) setBroadcasting(true);
          } catch {
            // A missed ping is harmless — the next interval retries; the
            // 5-minute freshness window on the server absorbs gaps.
          }
        },
        () => {
          if (!geoWarned.current) {
            geoWarned.current = true;
            toast.error(
              "Location permission denied.",
              "Allow location access for this site — without it, customers can't find you.",
            );
          }
        },
        { enableHighAccuracy: false, maximumAge: 10_000, timeout: 10_000 },
      );
    };

    ping();
    const timer = window.setInterval(ping, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);

  async function toggleOnline() {
    const next = !online;
    setToggling(true);
    setOnline(next); // optimistic
    try {
      await api.post(endpoints.driver.status, { online: next });
      toast.success(next ? "You're online — matching with riders." : "You're offline.");
      requests.refetch();
    } catch (err) {
      setOnline(!next); // revert on rejection
      toast.error(err instanceof ApiError ? err.message : "Couldn't update your status. Try again.");
    } finally {
      setToggling(false);
    }
  }

  async function acceptRequest(id: string) {
    setActionBusy(id);
    try {
      await api.post(endpoints.rides.accept(id));
      toast.success("Request accepted", "Head to the pickup point.");
      requests.refetch();
      job.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't accept this request.");
      requests.refetch();
    } finally {
      setActionBusy(null);
    }
  }

  async function advanceJob(current: CurrentJob) {
    // PAYMENT_PENDING is settled via settleCash (or the customer's wallet),
    // never via /complete — guard so a stale card can't fire a doomed call.
    if (current.status === "PAYMENT_PENDING") {
      navigate("/driver/trip");
      return;
    }
    setActionBusy(current.id);
    try {
      if (current.status === "ACCEPTED") {
        await api.post(endpoints.rides.start(current.id));
        toast.success("Trip started");
        job.refetch();
      } else {
        await api.post(endpoints.rides.complete(current.id));
        toast.success("Trip ended", "Collect the fare to wrap up this trip.");
        job.refetch();
        // The trip now sits in PAYMENT_PENDING — take the driver to the
        // Current trip page, which renders the collect-payment step. This
        // replaces the old jump back to the dashboard, which dead-ended the
        // flow with no payment step at all.
        navigate("/driver/trip");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the trip.");
      // The server is the source of truth. If this failed because the ride
      // had already moved on (e.g. two taps in quick succession racing each
      // other), re-sync now — otherwise the UI is left showing a job that no
      // longer exists server-side, and only a hard refresh clears it.
      job.refetch();
      requests.refetch();
    } finally {
      setActionBusy(null);
    }
  }

  /**
   * Driver confirms the customer handed over the fare in cash. On success
   * the ride is COMPLETED server-side; snapshot it into lastTrip so the
   * recap screen has data after /rides/current starts returning null.
   */
  async function settleCash(current: CurrentJob) {
    setActionBusy(current.id);
    try {
      await api.post(endpoints.rides.confirmCash(current.id));
      settledIdRef.current = current.id;
      setLastTrip({ id: current.id, service: current.service, from: current.from, to: current.to, fare: current.fare, method: "cash" });
      toast.success("Cash collected", "The fare has been added to your earnings.");
      earnings.refetch();
      job.refetch();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // ALREADY_SETTLED: the customer paid from their wallet a moment
        // before the tap. That's a success from the driver's point of view —
        // build the recap right now instead of waiting for the poll to
        // detect it, and skip the scary error toast.
        settledIdRef.current = current.id;
        setLastTrip({ id: current.id, service: current.service, from: current.from, to: current.to, fare: current.fare, method: "wallet" });
        toast.success("Fare received", "The customer paid from their Zamzam wallet.");
        earnings.refetch();
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't confirm the payment.");
      }
      job.refetch();
    } finally {
      setActionBusy(null);
    }
  }

  function clearLastTrip() {
    setLastTrip(null);
  }

  return (
    <DriverPortalContext.Provider
      value={{ online, toggling, broadcasting, myLocation, toggleOnline, earnings, requests, job, rating, actionBusy, acceptRequest, advanceJob, settleCash, lastTrip, clearLastTrip }}
    >
      <Outlet />
    </DriverPortalContext.Provider>
  );
}

export function useDriverPortal() {
  const ctx = useContext(DriverPortalContext);
  if (!ctx) throw new Error("useDriverPortal must be used within DriverPortalProvider");
  return ctx;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: { star: number; count: number }[];
}