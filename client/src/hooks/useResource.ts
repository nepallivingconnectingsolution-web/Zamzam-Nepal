import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncState } from "@/types";

interface ResourceResult<T> {
  state: AsyncState;
  data: T | null;
  error: Error | null;
  refetch: () => void;
}

interface ResourceOptions {
  /**
   * When set, silently refetches this resource on an interval (ms) so
   * screens like live order tracking stay current without the person
   * having to hit the browser's refresh button. Paused while the tab is
   * in the background and resumes with an immediate refetch the moment
   * it becomes visible again, so it never burns requests on a hidden tab.
   */
  refreshInterval?: number;
}

/**
 * The contract every data surface in Zamzam uses. It maps fetch outcomes to one
 * of five UI states so screens always render a deliberate empty / loading /
 * error / no-data view instead of inventing placeholder records.
 *
 *   resolved empty list -> "empty"
 *   resolved data       -> "success"
 *   thrown error        -> "error" (only on the *first* load — see below)
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: ResourceOptions = {},
): ResourceResult<T> {
  const [state, setState] = useState<AsyncState>("idle");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Whether this resource has ever loaded successfully. A refetch that
  // happens *after* that (background polling, or a manual refetch() call
  // made while data is already on screen) is a "background refresh" — if
  // it fails, we keep showing the last known-good data instead of
  // replacing it with a full error screen. This is what was silently
  // breaking the food-orders page: its 15s poll would hit a transient
  // failure (e.g. an access-token refresh in flight) and wipe out an
  // already-loaded order list with "Couldn't load this," which only a
  // full manual page reload would clear.
  const hasLoadedRef = useRef(false);

  // Guards a stale response from an older call (React StrictMode's
  // dev-only double-invoke, or a poll tick overlapping a manual refetch)
  // from overwriting a newer one.
  const requestIdRef = useRef(0);

  const run = useCallback(() => {
    const id = ++requestIdRef.current;
    const isBackgroundRefresh = hasLoadedRef.current;
    if (!isBackgroundRefresh) setState("loading");

    fetcherRef
      .current()
      .then((result) => {
        if (id !== requestIdRef.current) return; // superseded by a newer call
        const isEmpty =
          result == null || (Array.isArray(result) && result.length === 0);
        hasLoadedRef.current = true;
        setData(result);
        setState(isEmpty ? "empty" : "success");
        setError(null);
      })
      .catch((err: Error) => {
        if (id !== requestIdRef.current) return;
        setError(err);
        if (!isBackgroundRefresh) setState("error");
        // else: keep the last successful data/state on screen; the next
        // poll tick (or the person's next action) will try again.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    hasLoadedRef.current = false;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const { refreshInterval } = options;
  useEffect(() => {
    if (!refreshInterval) return;

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, refreshInterval);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // visibilitychange only reliably covers tab switches. Two side-by-side
    // browser windows (exactly how customer + driver flows get tested, and
    // how a real dispatcher would use this) can leave a window "hidden" via
    // occlusion with no visibilitychange ever firing on return — the poll
    // stays paused and the screen freezes on stale data. Refetching on
    // window focus (the React Query / SWR "revalidate on focus" pattern)
    // and when the network comes back online makes both cases self-heal
    // the instant the person returns to the window.
    const onWake = () => run();
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval, run]);

  return { state, data, error, refetch: run };
}