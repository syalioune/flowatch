// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for src/lib/useApi.ts.
 *
 * useApi() wraps a Promise-returning data fetcher and surfaces
 * {loading, data, error, reload} to screens. The hook is screen-side
 * orthogonal to api.ts (which handles HTTP); these tests don't touch
 * fetch at all — they drive the hook with synchronous + asynchronous
 * resolved/rejected functions and assert the state transitions.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useApi } from "../useApi";

afterEach(() => {
  cleanup();
});

describe("useApi", () => {
  it("starts in loading state and resolves to data on success", async () => {
    const { result } = renderHook(() => useApi(() => Promise.resolve(42)));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it("captures the error when the fetcher rejects", async () => {
    const boom = new Error("kaboom");
    const { result } = renderHook(() => useApi<number>(() => Promise.reject(boom)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(boom);
  });

  it("supports sync (non-Promise) return values via Promise.resolve coercion", async () => {
    const { result } = renderHook(() => useApi(() => "hello"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
  });

  it("re-runs the fetcher on reload() and reflects the new value", async () => {
    let n = 0;
    const { result } = renderHook(() => useApi(() => Promise.resolve(++n)));
    await waitFor(() => expect(result.current.data).toBe(1));

    act(() => result.current.reload());
    // reload sets loading=true, then data=2 after the promise resolves.
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(result.current.loading).toBe(false);
  });

  it("re-runs the fetcher when deps change", async () => {
    let id = "a";
    const fetcher = () => Promise.resolve(`fetched:${id}`);
    const { result, rerender } = renderHook(({ d }: { d: string }) => useApi(fetcher, [d]), {
      initialProps: { d: id },
    });
    await waitFor(() => expect(result.current.data).toBe("fetched:a"));

    id = "b";
    rerender({ d: "b" });
    await waitFor(() => expect(result.current.data).toBe("fetched:b"));
  });

  it("ignores resolution from an in-flight call that was cancelled by reload", async () => {
    // First fetcher resolves slowly; reload kicks off a faster second
    // call. The slow result must not overwrite the fresh one.
    let resolveFirst: (v: string) => void;
    const firstP = new Promise<string>((res) => {
      resolveFirst = res;
    });
    let call = 0;
    const fetcher = () => {
      call++;
      return call === 1 ? firstP : Promise.resolve("fast");
    };
    const { result } = renderHook(() => useApi(fetcher));

    // Trigger reload while the first call is still pending.
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe("fast"));

    // Now resolve the stale first call — state must NOT regress.
    act(() => {
      resolveFirst!("slow-stale");
    });
    // Give React a tick to process the (cancelled) resolution.
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.data).toBe("fast");
  });
});
