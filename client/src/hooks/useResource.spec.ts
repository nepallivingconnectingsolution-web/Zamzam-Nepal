import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useResource } from "./useResource";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useResource", () => {
  it("starts idle, then loading, then success with data", async () => {
    const { promise, resolve } = deferred<{ id: number }>();
    const fetcher = vi.fn(() => promise);

    const { result } = renderHook(() => useResource(fetcher));
    expect(result.current.state).toBe("loading");

    await act(async () => {
      resolve({ id: 1 });
      await promise;
    });

    await waitFor(() => expect(result.current.state).toBe("success"));
    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.error).toBeNull();
  });

  it("maps an empty array result to the 'empty' state, not 'success'", async () => {
    const fetcher = vi.fn(() => Promise.resolve([]));
    const { result } = renderHook(() => useResource(fetcher));
    await waitFor(() => expect(result.current.state).toBe("empty"));
  });

  it("maps a null result to the 'empty' state", async () => {
    const fetcher = vi.fn(() => Promise.resolve(null));
    const { result } = renderHook(() => useResource(fetcher));
    await waitFor(() => expect(result.current.state).toBe("empty"));
  });

  it("goes to the 'error' state when the first load fails", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("network down")));
    const { result } = renderHook(() => useResource(fetcher));
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error?.message).toBe("network down");
  });

  it("ignores a stale response from a superseded call (out-of-order guard)", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let call = 0;
    const fetcher = vi.fn(() => (++call === 1 ? first.promise : second.promise));

    const { result, rerender } = renderHook((dep: number) => useResource(fetcher, [dep]), {
      initialProps: 0,
    });

    // Trigger a second, newer call before the first one resolves.
    rerender(1);

    await act(async () => {
      second.resolve("second (newer)");
      await second.promise;
    });
    await waitFor(() => expect(result.current.data).toBe("second (newer)"));

    // The stale first call resolving afterwards must NOT overwrite the newer data.
    await act(async () => {
      first.resolve("first (stale)");
      await first.promise;
    });
    expect(result.current.data).toBe("second (newer)");
  });

  it("keeps last-known-good data on a background refresh failure instead of clearing it to an error screen", async () => {
    const first = deferred<string>();
    const fetcher = vi.fn(() => first.promise);
    const { result } = renderHook(() => useResource(fetcher));

    await act(async () => {
      first.resolve("loaded once");
      await first.promise;
    });
    await waitFor(() => expect(result.current.state).toBe("success"));

    // Now make the *next* call (a manual refetch, simulating a poll tick) fail.
    const second = deferred<string>();
    fetcher.mockImplementationOnce(() => second.promise);
    act(() => {
      result.current.refetch();
    });

    await act(async () => {
      second.reject(new Error("transient failure"));
      try {
        await second.promise;
      } catch {
        // expected
      }
    });

    // State must still show the last-known-good data, not flip to "error".
    expect(result.current.state).toBe("success");
    expect(result.current.data).toBe("loaded once");
    expect(result.current.error?.message).toBe("transient failure");
  });
});
