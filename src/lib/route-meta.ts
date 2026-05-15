/**
 * TypeScript augmentation for TanStack Router's per-route staticData.
 *
 * Each route declares its own `title` (shown in the Topbar / document title)
 * and `endpoints` (chip row in the API Inspector). Replaces the old
 * `VIEW_TITLE` + `ENDPOINT_BY_VIEW` maps in src/app.tsx + the legacy
 * `DATA.endpoints` registry in src/data.ts (both deleted by Story 3.6).
 */

import { useRouterState } from "@tanstack/react-router";

export interface RouteEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  desc: string;
}

export interface RouteMeta {
  title: string;
  endpoints: ReadonlyArray<RouteEndpoint>;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    title?: string;
    endpoints?: ReadonlyArray<RouteEndpoint>;
  }
}

/**
 * Read the deepest active route's staticData. Detail routes (e.g. /tasks/$id)
 * shadow their list parent — the deepest match wins. Falls back to "Flowatch"
 * / [] when no match defines a title or endpoints.
 */
export function useRouteMeta(): RouteMeta {
  return useRouterState({
    select: (s) => {
      const deepest = s.matches[s.matches.length - 1];
      const sd = deepest?.staticData;
      return {
        title: sd?.title ?? "Flowatch",
        endpoints: sd?.endpoints ?? [],
      };
    },
  });
}
