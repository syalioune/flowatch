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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, type ApiLogEntry, FlowableError } from "../../api";
import { ErrorBox } from "../../screens";

describe("<ErrorBox>", () => {
  beforeEach(() => {
    // Reset module-singleton state so per-test API_LOG seeds are deterministic.
    API_LOG.length = 0;
  });
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

  // ── Story 7.3 ────────────────────────────────────────────────────────────
  // HTTP status surfacing + disabled Inspector hint.

  it("(7.3) renders 'HTTP NNN' above the body for FlowableError", () => {
    render(<ErrorBox error={new FlowableError("Object not found", 404)} />);
    expect(screen.getByText("HTTP 404")).toBeInTheDocument();
    expect(screen.getByText("Object not found")).toBeInTheDocument();
  });

  it("(7.3) does NOT render an HTTP line for a generic Error", () => {
    render(<ErrorBox error={new Error("network failure")} />);
    expect(screen.getByText("network failure")).toBeInTheDocument();
    expect(screen.queryByText(/^HTTP /)).toBeNull();
  });

  it("(7.3) does NOT render an HTTP line for an unknown thrown value", () => {
    render(<ErrorBox error="some raw string" />);
    expect(screen.getByText("some raw string")).toBeInTheDocument();
    expect(screen.queryByText(/^HTTP /)).toBeNull();
  });

  // ── Story 8.2 ────────────────────────────────────────────────────────────
  // Disabled hint upgraded to a real <button data-testid="open-inspector">.
  // ErrorBox now also exposes data-testid="error-box" on its wrapper for
  // the new E2E to target the box without relying on placeholder copy.

  it("(8.2) renders the Open Inspector button (no longer disabled)", () => {
    render(<ErrorBox error={new Error("boom")} />);
    const btn = screen.getByTestId("open-inspector");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Open Inspector ↗");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).not.toHaveAttribute("data-disabled");
    expect(btn).not.toHaveAttribute("aria-disabled");
    expect(btn).toHaveAttribute("title", "Open API Inspector");
    expect(screen.getByTestId("error-box")).toBeInTheDocument();
  });

  it("(8.2) clicking Open Inspector dispatches app:open-inspector with focusEntryId from API_LOG", async () => {
    const seeded: ApiLogEntry = {
      id: "seed-id-42",
      method: "GET",
      path: "/x",
      url: "http://localhost:8080/x",
      status: 404,
      ms: 5,
      at: new Date().toISOString(),
      error: "Object not found",
    };
    API_LOG.unshift(seeded);

    const spy = vi.fn();
    window.addEventListener("app:open-inspector", spy as EventListener);

    const user = userEvent.setup();
    render(<ErrorBox error={new FlowableError("Object not found", 404)} />);
    await user.click(screen.getByTestId("open-inspector"));

    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0]?.[0] as CustomEvent<{ focusEntryId?: string } | undefined>;
    expect(ev.detail?.focusEntryId).toBe("seed-id-42");

    window.removeEventListener("app:open-inspector", spy as EventListener);
  });

  it("(8.2) Open Inspector still fires when API_LOG has no matching entry — focusEntryId is absent", async () => {
    const spy = vi.fn();
    window.addEventListener("app:open-inspector", spy as EventListener);

    const user = userEvent.setup();
    render(<ErrorBox error={new FlowableError("unmatched body", 500)} />);
    await user.click(screen.getByTestId("open-inspector"));

    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0]?.[0] as CustomEvent<{ focusEntryId?: string } | undefined>;
    // CustomEvent({ detail: undefined }) coerces to null per WHATWG DOM spec —
    // the contract the listener actually reads is `ev.detail?.focusEntryId`,
    // which is `undefined` for both null and undefined detail.
    expect(ev.detail?.focusEntryId).toBeUndefined();

    window.removeEventListener("app:open-inspector", spy as EventListener);
  });

  it("(7.3 review) preserves whitespace and newlines verbatim (P-003)", () => {
    const noisy = "line one\n  line two (indented)\nline three";
    render(<ErrorBox error={new FlowableError(noisy, 500)} />);
    // toHaveTextContent strips internal whitespace, so assert against the DOM
    // node's textContent directly to verify white-space:pre-wrap preserves it.
    const body = screen.getByText((_, node) => node?.textContent === noisy);
    expect(body).toBeInTheDocument();
  });

  it("(7.3 review) suppresses 'HTTP NNN' line when status is 0 (network/CORS)", () => {
    render(<ErrorBox error={new FlowableError("Failed to fetch", 0)} />);
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    expect(screen.queryByText(/^HTTP /)).toBeNull();
  });
});
