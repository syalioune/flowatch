// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <VersionDriftBanner> (Story 31.1 — NFR-7).
 * Walks the full drift-predicate truth-table + the per-version dismissal
 * persistence. The `__FLOWABLE_TESTED_VERSION__` build global is stubbed per
 * test (vitest.config.ts does not apply vite.config's `define`), and
 * localStorage is cleared between tests.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionDriftBanner } from "../VersionDriftBanner";

const DISMISS_KEY = "flowatch.version-banner-dismissed.v1";

function setTested(value: string): void {
  vi.stubGlobal("__FLOWABLE_TESTED_VERSION__", value);
}

beforeEach(() => {
  localStorage.clear();
  setTested("7.2.0");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("<VersionDriftBanner> drift predicate", () => {
  it("renders nothing when detected === tested (AC #5, golden path silent)", () => {
    render(<VersionDriftBanner detected="7.2.0" />);
    expect(screen.queryByTestId("version-drift-banner")).not.toBeInTheDocument();
  });

  it("renders nothing when detected is undefined (AC #6, drift undeterminable)", () => {
    render(<VersionDriftBanner detected={undefined} />);
    expect(screen.queryByTestId("version-drift-banner")).not.toBeInTheDocument();
  });

  it("renders nothing when tested is the 'unknown' sentinel (AC #7)", () => {
    setTested("unknown");
    render(<VersionDriftBanner detected="7.5.0" />);
    expect(screen.queryByTestId("version-drift-banner")).not.toBeInTheDocument();
  });

  it("renders the banner with the exact copy when versions drift (AC #1)", () => {
    render(<VersionDriftBanner detected="7.5.0" />);
    const banner = screen.getByTestId("version-drift-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("role", "status");
    expect(banner).toHaveTextContent(
      "Flowatch is tested against Flowable 7.2.0. Detected: 7.5.0 — some features may differ. See docs/compat.md.",
    );
  });
});

describe("<VersionDriftBanner> dismissal", () => {
  it("clicking dismiss hides the banner AND persists the detected version (AC #2)", async () => {
    const user = userEvent.setup();
    render(<VersionDriftBanner detected="7.5.0" />);
    expect(screen.getByTestId("version-drift-banner")).toBeInTheDocument();

    await user.click(screen.getByTestId("version-banner-dismiss"));

    expect(screen.queryByTestId("version-drift-banner")).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("7.5.0");
  });

  it("stays hidden when the dismissed version matches the detected version (AC #3)", () => {
    localStorage.setItem(DISMISS_KEY, "7.5.0");
    render(<VersionDriftBanner detected="7.5.0" />);
    expect(screen.queryByTestId("version-drift-banner")).not.toBeInTheDocument();
  });

  it("re-appears when a DIFFERENT drifting version is detected (AC #4)", () => {
    localStorage.setItem(DISMISS_KEY, "7.5.0");
    render(<VersionDriftBanner detected="7.6.0" />);
    expect(screen.getByTestId("version-drift-banner")).toBeInTheDocument();
  });
});
