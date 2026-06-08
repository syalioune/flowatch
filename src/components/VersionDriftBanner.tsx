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
  const tested = __FLOWABLE_TESTED_VERSION__;
  // Lazy-read the persisted dismissal once on mount.
  const [dismissedVersion, setDismissedVersion] = React.useState<string | null>(() =>
    readDismissedVersion(),
  );

  const drift =
    !!detected && tested !== "unknown" && detected !== tested && detected !== dismissedVersion;

  if (!drift) return null;

  const dismiss = (): void => {
    // `detected` is a non-empty string here (drift === true gated on it).
    writeDismissedVersion(detected as string);
    setDismissedVersion(detected as string);
  };

  return (
    <div className="version-banner" role="status" data-testid="version-drift-banner">
      <span className="version-banner-msg">
        Flowatch is tested against Flowable {tested}. Detected: {detected} — some features may
        differ. See <a href="docs/compat.md">docs/compat.md</a>.
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
