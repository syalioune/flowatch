// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the per-sub-app `*Base()` derivation helpers (Story 34.1 —
 * FR-59). Asserts backward-compatibility (default derivation is byte-identical
 * to the pre-34.1 `String.replace` output), configurable segments, and the
 * graceful-degrade path when `baseUrl` doesn't end with the configured
 * `servicePath`.
 *
 * COMPAT-BOUNDARY (Story 29.1): no non-standard-mount Flowable image exists for
 * `make stack`, so the custom-prefix path is unit-verified here; the live e2e
 * stays on the bundled engine's standard mounts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, appBase, cmmnBase, connectionRoot, dmnBase } from "../api";

const DEFAULTS = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
};

// The pre-34.1 derivation, kept here to prove byte-identity of the new helpers.
const legacyDmnBase = (baseUrl: string) => baseUrl.replace(/\/service\/?$/, "/dmn-api");
const legacyAppBase = (baseUrl: string) => baseUrl.replace(/\/service\/?$/, "/app-api");

beforeEach(() => {
  localStorage.clear();
  api.setConfig({
    ...DEFAULTS,
    servicePath: undefined,
    dmnPath: undefined,
    cmmnPath: undefined,
    appPath: undefined,
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("*Base() derivation — backward-compat (all prefix fields blank)", () => {
  it("dmnBase() default equals the pre-34.1 replace() output", () => {
    expect(dmnBase()).toBe(legacyDmnBase(DEFAULTS.baseUrl));
    expect(dmnBase()).toBe("http://localhost:8080/flowable-rest/dmn-api");
  });

  it("appBase() default equals the pre-34.1 replace() output", () => {
    expect(appBase()).toBe(legacyAppBase(DEFAULTS.baseUrl));
    expect(appBase()).toBe("http://localhost:8080/flowable-rest/app-api");
  });

  it("cmmnBase() default resolves to the standard /cmmn-api mount", () => {
    expect(cmmnBase()).toBe("http://localhost:8080/flowable-rest/cmmn-api");
  });

  it("connectionRoot() strips the default /service suffix", () => {
    expect(connectionRoot()).toBe("http://localhost:8080/flowable-rest");
  });

  it("tolerates a trailing slash on baseUrl", () => {
    api.setConfig({ baseUrl: "http://localhost:8080/flowable-rest/service/" });
    expect(connectionRoot()).toBe("http://localhost:8080/flowable-rest");
    expect(dmnBase()).toBe("http://localhost:8080/flowable-rest/dmn-api");
  });
});

describe("*Base() derivation — configurable segments", () => {
  it("custom dmnPath retargets only the DMN base", () => {
    api.setConfig({ dmnPath: "/custom-dmn" });
    expect(dmnBase()).toBe("http://localhost:8080/flowable-rest/custom-dmn");
    expect(appBase()).toBe("http://localhost:8080/flowable-rest/app-api"); // untouched
  });

  it("custom appPath retargets only the App base", () => {
    api.setConfig({ appPath: "/apps" });
    expect(appBase()).toBe("http://localhost:8080/flowable-rest/apps");
    expect(dmnBase()).toBe("http://localhost:8080/flowable-rest/dmn-api");
  });

  it("custom cmmnPath retargets the CMMN base", () => {
    api.setConfig({ cmmnPath: "/cases" });
    expect(cmmnBase()).toBe("http://localhost:8080/flowable-rest/cases");
  });

  it("custom servicePath changes the stripped suffix and recovered root", () => {
    api.setConfig({
      baseUrl: "http://engine.example/flowable/process-api",
      servicePath: "/process-api",
    });
    expect(connectionRoot()).toBe("http://engine.example/flowable");
    expect(dmnBase()).toBe("http://engine.example/flowable/dmn-api");
  });

  it("all four segments custom on a non-standard deployment", () => {
    api.setConfig({
      baseUrl: "https://flow.acme.io/rest/svc",
      servicePath: "/svc",
      dmnPath: "/dmn",
      cmmnPath: "/cmmn",
      appPath: "/app",
    });
    expect(connectionRoot()).toBe("https://flow.acme.io/rest");
    expect(dmnBase()).toBe("https://flow.acme.io/rest/dmn");
    expect(cmmnBase()).toBe("https://flow.acme.io/rest/cmmn");
    expect(appBase()).toBe("https://flow.acme.io/rest/app");
  });
});

describe("*Base() derivation — graceful degrade", () => {
  it("when baseUrl does not end with servicePath, returns baseUrl as the root", () => {
    // Operator typed a bare deployment root (no /service suffix).
    api.setConfig({ baseUrl: "http://localhost:8080/flowable-rest" });
    expect(connectionRoot()).toBe("http://localhost:8080/flowable-rest");
    // Sub-app segment still appends rather than throwing.
    expect(dmnBase()).toBe("http://localhost:8080/flowable-rest/dmn-api");
  });

  it("custom servicePath that doesn't match the baseUrl tail degrades to baseUrl", () => {
    api.setConfig({ baseUrl: "http://localhost:8080/flowable-rest/service", servicePath: "/nope" });
    expect(connectionRoot()).toBe("http://localhost:8080/flowable-rest/service");
    expect(dmnBase()).toBe("http://localhost:8080/flowable-rest/service/dmn-api");
  });
});
