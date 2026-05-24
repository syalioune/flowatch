// SPDX-License-Identifier: Apache-2.0

/**
 * Builds a reproducible curl invocation from a logged ApiLogEntry.
 *
 * SECURITY NOTE — intentional asymmetry with NFR-8:
 *   API_LOG redacts the Authorization header (NFR-8: passive observation
 *   must not leak credentials). The clipboard output here is the
 *   inverse: it intentionally includes the real username:password from
 *   api.config() because the user explicitly clicked "Copy as curl" —
 *   clipboard access is gated by user intent. See Epic 7 retro §6 item 4
 *   for the design discussion.
 */

import type { ApiLogEntry, FlowableConfig } from "../api";

// Sentinels for the two non-buildable shapes. Exported so the React caller
// can match by reference rather than by magic-string. Empty string remains
// the "buildable but absent" zero value — neither sentinel is the empty
// string by design (a future code path that returns "" by accident still
// renders the button-less note path).
export const CURL_MULTIPART = "__curl_multipart__" as const;
export const CURL_UNSERIALIZABLE = "__curl_unserializable__" as const;

// POSIX-safe single-quote escape: close the quote, insert an escaped quote,
// reopen — `O'Brien` becomes `O'\''Brien`. Wrapping in single quotes at the
// call site is the caller's responsibility.
function shellEscapeSingle(s: string): string {
  return s.replace(/'/g, "'\\''");
}

// Multipart uploads are identified by (a) the exact deploy path (not just
// a suffix — `runRaw("POST", "/foo/repository/deployments", ...)` should
// NOT be hidden) AND (b) the absence of `entry.body` (the funnel never
// populates body for the multipart path; a JSON POST to the same URL via
// runRaw would have body set and remains reproducible). Patch from review.
function isMultipartDeploy(entry: ApiLogEntry): boolean {
  if (entry.method !== "POST" || entry.body !== undefined) return false;
  return entry.path === "/repository/deployments" || entry.path === "/dmn-repository/deployments";
}

export function buildCurlCommand(entry: ApiLogEntry, cfg: FlowableConfig): string {
  if (isMultipartDeploy(entry)) return CURL_MULTIPART;

  // Nullish-coerce username/password so a partial-hydrated config doesn't
  // ship "undefined:undefined" into the clipboard (review patch).
  const creds = `'${shellEscapeSingle(`${cfg.username ?? ""}:${cfg.password ?? ""}`)}'`;
  const url = `'${shellEscapeSingle(entry.url)}'`;

  // Honour the captured Accept (raw=true paths send `*/*`; reproducing as
  // `application/json` would change the response shape). Fall back to
  // application/json when the funnel didn't record one (review patch).
  const accept = entry.headers?.Accept ?? "application/json";

  const lines: string[] = [
    `curl -u ${creds}`,
    `  -X ${entry.method}`,
    `  -H 'Accept: ${shellEscapeSingle(accept)}'`,
  ];

  if (entry.body !== undefined) {
    const ct = entry.headers?.["Content-Type"] ?? "application/json";
    lines.push(`  -H 'Content-Type: ${shellEscapeSingle(ct)}'`);
    // BigInt, circular refs, and throwing toJSON propagate as throws.
    // Catching here keeps the React render path (which calls this helper
    // inside the row JSX) crash-free — patch from review.
    let serialized: string;
    try {
      serialized = JSON.stringify(entry.body);
    } catch {
      return CURL_UNSERIALIZABLE;
    }
    lines.push(`  --data-raw '${shellEscapeSingle(serialized)}'`);
  }

  lines.push(`  ${url}`);
  return lines.join(" \\\n");
}
