// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit test for the `conn:config-changed` window event dispatched by
 * api.setConfig() (Story 7.2, AC-8). The event signals the engine probe in
 * <App /> to re-run without a full page reload.
 *
 * Per Pattern P-009 we exercise the real api.setConfig — no module mocks.
 *
 * Review patch (2026-05-23): dispatch is gated to baseUrl/username/password
 * changes — tenant-only updates and no-op calls must not flash the conn pill
 * or trigger a redundant /management/engine round-trip.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

const DEFAULTS = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  // gitguardian:ignore - test fixture, not a real secret
  password: "test",
  tenantId: "",
};

beforeEach(() => {
  api.setConfig(DEFAULTS);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const hasConnEvent = (calls: unknown[][]): boolean =>
  calls.some(([ev]) => (ev as Event).type === "conn:config-changed");

describe("api.setConfig — conn:config-changed event (AC-8)", () => {
  it("dispatches a CustomEvent('conn:config-changed') when baseUrl changes", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    api.setConfig({
      // gitguardian:ignore - test fixture, not a real secret
      baseUrl: "http://new-host/flowable-rest/service",
      username: "u",
      // gitguardian:ignore - test fixture, not a real secret
      password: "p",
    });

    expect(hasConnEvent(spy.mock.calls)).toBe(true);
  });

  it("does NOT dispatch when only tenantId changes (review patch)", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    api.setConfig({ tenantId: "acme" });

    expect(hasConnEvent(spy.mock.calls)).toBe(false);
  });

  it("does NOT dispatch when called with same connection values (no-op)", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    api.setConfig({
      baseUrl: DEFAULTS.baseUrl,
      username: DEFAULTS.username,
      password: DEFAULTS.password,
    });

    expect(hasConnEvent(spy.mock.calls)).toBe(false);
  });
});
