// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest browser-tier suite for <ErrorBox>.
 *
 * Per Pattern P-003: errors propagate verbatim. ErrorBox renders err.message
 * with no friendly rewrites. This suite enforces that contract by passing
 * an explicitly-noisy error (newlines, whitespace, brackets) and asserting
 * the DOM preserves it character-for-character.
 *
 * Runs in real Chromium via Vitest's Playwright provider.
 *
 * NOTE on import path: <ErrorBox> currently lives in src/screens.tsx (it is a
 * presentation helper used by every screen's "error" state — Pattern P-002).
 * The spec's working assumption that ErrorBox lives in src/components.tsx is
 * inaccurate for the current source tree; until a future story relocates it,
 * we import from "../../screens".
 *
 * See: _bmad-output/planning-artifacts/architecture.md#p-003
 */

// Side-effect import re-applies the jest-dom matchers and surfaces their
// TypeScript augmentation (vitest.setup.ts is outside tsconfig include).
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowableError } from "../../api";
import { ErrorBox } from "../../screens";

describe("<ErrorBox>", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the verbatim engine error message", () => {
    const err = new FlowableError("Tenant id is required", 400);
    render(<ErrorBox error={err} />);
    expect(screen.getByText("Tenant id is required")).toBeInTheDocument();
  });

  it("renders the verbatim engine body even with brackets and quotes", () => {
    const noisy = `Validation failed: field 'x' must be > 0 [detail: see logs]`;
    render(<ErrorBox error={new FlowableError(noisy, 422)} />);
    expect(screen.getByText(noisy)).toBeInTheDocument();
  });

  it("falls back to String(error) when the error value is not Error-shaped", () => {
    render(<ErrorBox error={"raw string error"} />);
    expect(screen.getByText("raw string error")).toBeInTheDocument();
  });

  it("invokes onRetry when the Retry button is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorBox error={new Error("boom")} onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: /retry/i });
    await user.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render a Retry button when onRetry is omitted", () => {
    render(<ErrorBox error={new Error("boom")} />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});
