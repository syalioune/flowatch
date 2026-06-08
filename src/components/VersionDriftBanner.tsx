// SPDX-License-Identifier: Apache-2.0

/**
 * <VersionDriftBanner> — Story 31.1 (NFR-7, prd.md:422).
 *
 * Non-blocking advisory banner shown when the live Flowable engine reports a
 * version that does NOT match the version Flowatch was tested against. The
 * tested baseline is the build-time global `__FLOWABLE_TESTED_VERSION__`
 * (parsed from docs/compat.md frontmatter by vite.config.ts — currently
 * "7.2.0"; falls back to the sentinel "unknown" when unreadable). The detected
 * version is prop-drilled in from App's `conn.version` (the value api.ping()
 * already returns — no extra round-trip).
 *
 * Drift predicate (render null unless ALL hold):
 *   - `detected` is a non-empty string                      (AC #6 — no version → no banner)
 *   - `tested !== "unknown"`                                 (AC #7 — no baseline → can't compare)
 *   - `detected !== tested`                                  (AC #5 — golden path is silent)
 *   - `detected !== dismissedVersion`                        (AC #3 — per-version dismissal)
 *
 * Comparison is EXACT-STRING inequality of the full version triples — NOT
 * semver-range tolerance. Patch-level drift legitimately counts as "may
 * differ"; the per-version dismissal (AC #2/#4) makes any false-positive a
 * one-click, persistent dismiss for that specific version.
 *
 * Fixture-only against `make stack`: the default engine reports the tested
 * 7.2.0 so this NEVER fires live (golden path silent) — the drift path is
 * fixture-verified via page.route in e2e/version-drift-banner.spec.ts.
 */

import React from "react";

// `flowatch.<surface>.v1` convention (cf. flowatch.connections.v1 /
// flowatch.tweaks.v1). Stores the DISMISSED VERSION STRING (not a boolean) so
// the dismissal is version-specific: a later drift to a different version
// re-shows the banner (AC #4).
const DISMISS_STORAGE_KEY = "flowatch.version-banner-dismissed.v1";

// docs/ is NOT bundled into the deployed SPA — a route-relative href would 404.
// Point at the repo source so the link resolves from any screen.
const COMPAT_DOC_URL = "https://github.com/syalioune/flowatch/blob/main/docs/compat.md";

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, version);
  } catch {
    // Private-mode / quota: degrade to session-only dismissal (the component
    // state below still hides the banner this session). Never crash the chrome.
  }
}

export function VersionDriftBanner({
  detected,
}: {
  detected?: string | undefined;
}): React.ReactElement | null {
  // Normalize both sides before comparing/displaying. The vite `define` capture
  // (`[^"\n]+` in vite.config.ts) keeps a trailing `\r` on a CRLF compat.md, and
  // the engine could pad `r.version`; an un-trimmed exact-string compare would
  // false-positive the banner on the golden path. Trimming is whitespace
  // normalization, NOT semver tolerance — exact-string intent is preserved.
  const tst = __FLOWABLE_TESTED_VERSION__.trim();
  const det = detected?.trim();
  // Lazy-read the persisted dismissal once on mount.
  const [dismissedVersion, setDismissedVersion] = React.useState<string | null>(() =>
    readDismissedVersion(),
  );

  const drift = !!det && tst !== "unknown" && det !== tst && det !== dismissedVersion;

  if (!drift) return null;

  const dismiss = (): void => {
    // `det` is a non-empty string here (drift === true gated on it).
    writeDismissedVersion(det as string);
    setDismissedVersion(det as string);
  };

  return (
    <div className="version-banner" role="status" data-testid="version-drift-banner">
      <span className="version-banner-msg">
        Flowatch is tested against Flowable {tst}. Detected: {det} — some features may differ. See{" "}
        <a href={COMPAT_DOC_URL} target="_blank" rel="noreferrer">
          docs/compat.md
        </a>
        .
      </span>
      <button
        type="button"
        className="version-banner-dismiss"
        aria-label="Dismiss version-compatibility warning"
        data-testid="version-banner-dismiss"
        onClick={dismiss}
      >
        ✕
      </button>
    </div>
  );
}
