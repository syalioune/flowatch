// SPDX-License-Identifier: Apache-2.0

/**
 * Single source of truth for "extract an HTTP-shaped status from an unknown
 * error value." Replaces three inline duplications surfaced by Epic 7 retro
 * §3.3 / A-3: ErrorBox (src/lib/error-box.tsx), KpiValue (src/routes/index.tsx),
 * and the upcoming Inspector drawer's expanded-row HTTP-line.
 *
 * Returns 0 for: non-Error values, Error instances without a numeric .status,
 * and the FlowableError(_, 0) sentinel used for network/CORS/abort failures.
 * Consumers that need to distinguish "no HTTP exchange happened" from "HTTP
 * exchange happened with status 0" must read FlowableError.status directly.
 */

import { FlowableError } from "../api";

export function errorStatus(err: unknown): number {
  const raw =
    err instanceof FlowableError ? err.status : (err as { status?: unknown } | null)?.status;
  // Number.isFinite filters NaN, Infinity, and non-numeric values in one
  // predicate. A negative status is meaningless for HTTP so it collapses
  // to 0 alongside the other malformed inputs.
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}
