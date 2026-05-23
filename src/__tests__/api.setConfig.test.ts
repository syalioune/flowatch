// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit test for the `conn:config-changed` window event dispatched by
 * api.setConfig() (Story 7.2, AC-8). The event signals the engine probe in
 * <App /> to re-run without a full page reload.
 *
 * Per Pattern P-009 we exercise the real api.setConfig — no module mocks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

const DEFAULTS = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
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

describe("api.setConfig — conn:config-changed event (AC-8)", () => {
  it("dispatches a CustomEvent('conn:config-changed') on window after updating config", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    api.setConfig({
      // gitguardian:ignore - test fixture, not a real secret
      baseUrl: "http://new-host/flowable-rest/service",
      username: "u",
      // gitguardian:ignore - test fixture, not a real secret
      password: "p",
    });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "conn:config-changed" }));
  });

  it("dispatches the event even when only tenantId changes", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    api.setConfig({ tenantId: "acme" });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "conn:config-changed" }));
  });
});
