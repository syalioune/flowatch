// SPDX-License-Identifier: Apache-2.0

/**
 * Crypto-backed random identifier helper.
 *
 * Replaces ad-hoc `Math.random().toString(36).slice(2)` patterns that
 * CodeQL CWE-338 (`js/insecure-randomness`) flags across the codebase.
 * The IDs we mint here are NOT security-sensitive (in-memory keys for
 * API_LOG entries + toast items) but CodeQL flags every `Math.random`
 * call regardless of context, and using the Web Crypto API removes the
 * findings without changing call-site ergonomics.
 *
 * Behaviour:
 * - When `crypto.getRandomValues` is available (every modern browser +
 *   jsdom), pull bytes + render as a hex string.
 * - When unavailable (extremely old runtimes), fall back to a
 *   timestamp-derived string. The fallback accepts collision risk —
 *   acceptable for the consumers here (per-process unique-enough keys
 *   that never leave the tab).
 *
 * `length` is the number of hex characters to return (default 7 — matches
 * the historical `.slice(2, 9)` width). Pass a larger value when the ID
 * is publicly observable.
 */
export function randomId(length = 7): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const byteCount = Math.ceil(length / 2);
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex.slice(0, length);
  }
  return Date.now().toString(36).slice(-length);
}
