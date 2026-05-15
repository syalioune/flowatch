// SPDX-License-Identifier: Apache-2.0

/**
 * Generic data hook — calls `fn` on mount + when any dependency changes.
 * Tracks loading / data / error state in one place so screens stay readable.
 *
 * Per Pattern P-005: this is the only data-fetching primitive for screens.
 * Route loaders (TanStack Router) are the alternative for URL-identity data
 * (Story 3.3 onwards); useApi is for secondary fetches inside components.
 *
 * Extracted from src/screens.tsx during Story 3.3 so detail components in
 * src/components/ can import it without taking a dependency on screens.tsx.
 */

import React from "react";

export interface UseApiResult<T> {
  loading: boolean;
  data: T | null;
  error: Error | null;
  reload: () => void;
}

export function useApi<T>(fn: () => Promise<T> | T, deps: unknown[] = []): UseApiResult<T> {
  const [state, setState] = React.useState<{
    loading: boolean;
    data: T | null;
    error: Error | null;
  }>({
    loading: true,
    data: null,
    error: null,
  });
  const [tick, setTick] = React.useState(0);
  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fn is recreated on every render by design — callers control re-fetch via `deps`; tick is the manual reload trigger.
  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(fn())
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ loading: false, data: null, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, tick]);
  return { ...state, reload };
}
