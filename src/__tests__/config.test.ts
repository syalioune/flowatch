// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for localStorage persistence in src/api.ts.
 *
 * Tests the three loadCfg() paths:
 *   1. Valid JSON → returns stored values (merged with defaultCfg)
 *   2. Missing key → returns defaultCfg
 *   3. Corrupt JSON → catches SyntaxError, returns defaultCfg
 *
 * And the saveCfg() / setConfig() path:
 *   4. setConfig() with four fields → localStorage key contains all four fields
 *
 * Per Pattern P-009: we do NOT vi.mock("../api"). We exercise the real
 * loadCfg/saveCfg implementation in jsdom (localStorage is real in jsdom).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, loadCfg } from "../api";

const STORAGE_KEY = "flowatch.connection.v1";
const DEFAULTS = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
};

beforeEach(() => {
  // Reset singleton to defaults so each test starts from a known state.
  api.setConfig(DEFAULTS);
  // Clear AFTER setConfig: setConfig writes DEFAULTS to localStorage via saveCfg;
  // clearing last ensures every test begins with no persisted key unless it sets one itself.
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("loadCfg — missing key", () => {
  it("returns defaults when localStorage has no flowatch.connection.v1 key", () => {
    const cfg = loadCfg();
    expect(cfg.baseUrl).toBe(DEFAULTS.baseUrl);
    expect(cfg.username).toBe(DEFAULTS.username);
    expect(cfg.password).toBe(DEFAULTS.password);
    expect(cfg.tenantId).toBe(DEFAULTS.tenantId);
  });
});

describe("loadCfg — corrupt JSON", () => {
  it("returns defaults and does not throw when localStorage contains malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{bad json");
    expect(() => loadCfg()).not.toThrow();
    const cfg = loadCfg();
    expect(cfg.baseUrl).toBe(DEFAULTS.baseUrl);
    expect(cfg.username).toBe(DEFAULTS.username);
    expect(cfg.password).toBe(DEFAULTS.password);
    expect(cfg.tenantId).toBe(DEFAULTS.tenantId);
  });
});

describe("loadCfg — partial stored object", () => {
  it("merges partial stored object with defaults (AC-4)", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl: "http://staging:8080/flowable-rest/service" }),
    );
    const cfg = loadCfg();
    expect(cfg.baseUrl).toBe("http://staging:8080/flowable-rest/service");
    expect(cfg.username).toBe(DEFAULTS.username);
    expect(cfg.password).toBe(DEFAULTS.password);
    expect(cfg.tenantId).toBe(DEFAULTS.tenantId);
  });
});

describe("setConfig + saveCfg — round-trip (AC-1, AC-5)", () => {
  it("setConfig persists all four fields to localStorage", () => {
    api.setConfig({
      baseUrl: "http://prod:8080/flowable-rest/service",
      username: "admin",
      password: "s3cr3t",
      tenantId: "acme",
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.baseUrl).toBe("http://prod:8080/flowable-rest/service");
    expect(stored.username).toBe("admin");
    expect(stored.password).toBe("s3cr3t");
    expect(stored.tenantId).toBe("acme");
  });

  it("api.config() reflects values saved by setConfig (in-memory singleton)", () => {
    api.setConfig({
      baseUrl: "http://prod:8080/flowable-rest/service",
      username: "admin",
      password: "s3cr3t",
      tenantId: "acme",
    });

    const cfg = api.config();
    expect(cfg.baseUrl).toBe("http://prod:8080/flowable-rest/service");
    expect(cfg.username).toBe("admin");
    expect(cfg.password).toBe("s3cr3t");
    expect(cfg.tenantId).toBe("acme");
  });

  it("cold loadCfg() reads the four fields saved by setConfig (simulates page reload)", () => {
    api.setConfig({
      baseUrl: "http://prod:8080/flowable-rest/service",
      username: "admin",
      password: "s3cr3t",
      tenantId: "acme",
    });

    // Simulate a cold load: read directly from localStorage the way loadCfg would.
    const cfg = loadCfg();
    expect(cfg.baseUrl).toBe("http://prod:8080/flowable-rest/service");
    expect(cfg.username).toBe("admin");
    expect(cfg.password).toBe("s3cr3t");
    expect(cfg.tenantId).toBe("acme");
  });
});
