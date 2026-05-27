// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for buildCurlCommand(entry, cfg).
 *
 * Pure-function tests — no DOM, no clipboard mock, no api module. We build
 * ApiLogEntry / FlowableConfig fixtures inline and assert the curl output
 * byte-for-byte. The browser-tier test in ApiInspector.spec.tsx covers the
 * clipboard wiring; the e2e covers the real clipboard.
 */

import { describe, expect, it } from "vitest";
import type { ApiLogEntry, FlowableConfig } from "../../api";
import { buildCurlCommand, CURL_MULTIPART, CURL_UNSERIALIZABLE } from "../curl";

const cfg: FlowableConfig = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
};

function entry(over: Partial<ApiLogEntry>): ApiLogEntry {
  return {
    id: "x",
    method: "GET",
    path: "/probe",
    url: "http://localhost:8080/flowable-rest/service/probe",
    status: 200,
    ms: 1,
    at: "2026-05-24T00:00:00.000Z",
    ...over,
  };
}

describe("buildCurlCommand", () => {
  it("GET with no body produces the 4-line curl shape", () => {
    const e = entry({
      method: "GET",
      path: "/repository/deployments?size=10",
      url: "http://localhost:8080/flowable-rest/service/repository/deployments?size=10",
    });
    expect(buildCurlCommand(e, cfg)).toBe(
      `curl -u 'rest-admin:test' \\\n  -X GET \\\n  -H 'Accept: application/json' \\\n  'http://localhost:8080/flowable-rest/service/repository/deployments?size=10'`,
    );
  });

  it("POST with JSON body produces --data-raw + Content-Type", () => {
    const e = entry({
      method: "POST",
      path: "/runtime/process-instances",
      url: "http://localhost:8080/flowable-rest/service/runtime/process-instances",
      headers: { Authorization: "Basic ***", "Content-Type": "application/json" },
      body: { processDefinitionId: "def-1" },
    });
    expect(buildCurlCommand(e, cfg)).toBe(
      `curl -u 'rest-admin:test' \\\n  -X POST \\\n  -H 'Accept: application/json' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"processDefinitionId":"def-1"}' \\\n  'http://localhost:8080/flowable-rest/service/runtime/process-instances'`,
    );
  });

  it("PUT with JSON body mirrors POST shape with -X PUT", () => {
    const e = entry({
      method: "PUT",
      path: "/repository/process-definitions/def-1",
      url: "http://localhost:8080/flowable-rest/service/repository/process-definitions/def-1",
      headers: { "Content-Type": "application/json" },
      body: { action: "suspend" },
    });
    expect(buildCurlCommand(e, cfg)).toBe(
      `curl -u 'rest-admin:test' \\\n  -X PUT \\\n  -H 'Accept: application/json' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"action":"suspend"}' \\\n  'http://localhost:8080/flowable-rest/service/repository/process-definitions/def-1'`,
    );
  });

  it("DELETE with query params keeps the URL single-quoted (& survives the shell)", () => {
    const e = entry({
      method: "DELETE",
      path: "/repository/deployments/dep-1?cascade=true",
      url: "http://localhost:8080/flowable-rest/service/repository/deployments/dep-1?cascade=true",
    });
    expect(buildCurlCommand(e, cfg)).toBe(
      `curl -u 'rest-admin:test' \\\n  -X DELETE \\\n  -H 'Accept: application/json' \\\n  'http://localhost:8080/flowable-rest/service/repository/deployments/dep-1?cascade=true'`,
    );
  });

  it("single-quote inside username is POSIX-escaped", () => {
    const odd: FlowableConfig = { ...cfg, username: "a'b" };
    const e = entry({ method: "GET" });
    // POSIX trick: close quote, escaped quote, reopen quote → "'a'\''b:test'"
    expect(buildCurlCommand(e, odd)).toContain(`-u 'a'\\''b:test'`);
  });

  it("single-quote inside body is POSIX-escaped inside --data-raw", () => {
    const e = entry({
      method: "POST",
      url: "http://localhost:8080/flowable-rest/service/identity/users",
      body: { name: "O'Brien" },
    });
    expect(buildCurlCommand(e, cfg)).toContain(`--data-raw '{"name":"O'\\''Brien"}'`);
  });

  it("multipart deploy entry returns the CURL_MULTIPART sentinel (BPMN deploy)", () => {
    const e = entry({
      method: "POST",
      path: "/repository/deployments",
      url: "http://localhost:8080/flowable-rest/service/repository/deployments",
    });
    expect(buildCurlCommand(e, cfg)).toBe(CURL_MULTIPART);
  });

  it("multipart deploy entry returns the CURL_MULTIPART sentinel (DMN deploy)", () => {
    const e = entry({
      method: "POST",
      path: "/dmn-repository/deployments",
      url: "http://localhost:8080/flowable-rest/dmn-api/dmn-repository/deployments",
    });
    expect(buildCurlCommand(e, cfg)).toBe(CURL_MULTIPART);
  });

  it("JSON POST to the same deploy path (via runRaw) is NOT hidden as multipart (review patch)", () => {
    // A user typing a JSON body into Try-it and POSTing to /repository/deployments
    // is reproducible — body presence signals "this isn't a multipart upload".
    const e = entry({
      method: "POST",
      path: "/repository/deployments",
      url: "http://localhost:8080/flowable-rest/service/repository/deployments",
      body: { name: "hand-crafted" },
    });
    const out = buildCurlCommand(e, cfg);
    expect(out).not.toBe(CURL_MULTIPART);
    expect(out).toContain("--data-raw");
    expect(out).toContain('{"name":"hand-crafted"}');
  });

  it("path suffix that is NOT the exact deploy path is NOT hidden (review patch)", () => {
    // endsWith() would have wrongly hidden /foo/repository/deployments;
    // the exact-equality check guards against this.
    const e = entry({
      method: "POST",
      path: "/foo/repository/deployments",
      url: "http://localhost:8080/foo/repository/deployments",
    });
    expect(buildCurlCommand(e, cfg)).not.toBe(CURL_MULTIPART);
  });

  it("BigInt / circular / throwing body returns CURL_UNSERIALIZABLE (review patch)", () => {
    const eBig = entry({
      method: "POST",
      url: "http://localhost:8080/x",
      body: { v: 1n },
    });
    expect(buildCurlCommand(eBig, cfg)).toBe(CURL_UNSERIALIZABLE);

    const circ: Record<string, unknown> = { name: "loop" };
    circ.self = circ;
    const eCirc = entry({ method: "POST", url: "http://localhost:8080/x", body: circ });
    expect(buildCurlCommand(eCirc, cfg)).toBe(CURL_UNSERIALIZABLE);
  });

  it("nullish username/password are coerced to empty strings (review patch)", () => {
    const partial = {
      baseUrl: "http://localhost:8080/flowable-rest/service",
      username: undefined as unknown as string,
      password: undefined as unknown as string,
      tenantId: "",
    } as FlowableConfig;
    const e = entry({ method: "GET" });
    expect(buildCurlCommand(e, partial)).toContain(`-u ':'`);
    expect(buildCurlCommand(e, partial)).not.toContain("undefined");
  });

  it("honours captured Accept header from entry.headers (review patch — raw=true paths)", () => {
    const e = entry({
      method: "GET",
      url: "http://localhost:8080/x/resourcedata",
      headers: { Accept: "*/*", Authorization: "Basic ***" },
    });
    expect(buildCurlCommand(e, cfg)).toContain(`-H 'Accept: */*'`);
    expect(buildCurlCommand(e, cfg)).not.toContain(`-H 'Accept: application/json'`);
  });

  it("falls back to Content-Type: application/json when entry.headers is missing", () => {
    const e = entry({
      method: "POST",
      url: "http://localhost:8080/flowable-rest/service/runtime/process-instances",
      body: { x: 1 },
    });
    expect(buildCurlCommand(e, cfg)).toContain(`-H 'Content-Type: application/json'`);
  });

  it("honours non-JSON Content-Type from entry.headers when present", () => {
    const e = entry({
      method: "POST",
      url: "http://localhost:8080/x",
      headers: { "Content-Type": "application/xml" },
      body: { _: "<bpmn/>" },
    });
    expect(buildCurlCommand(e, cfg)).toContain(`-H 'Content-Type: application/xml'`);
  });

  it("GET that happens to match a /repository/deployments suffix is NOT excluded (method check guards)", () => {
    const e = entry({
      method: "GET",
      path: "/repository/deployments",
      url: "http://localhost:8080/flowable-rest/service/repository/deployments",
    });
    expect(buildCurlCommand(e, cfg)).not.toBe("");
    expect(buildCurlCommand(e, cfg)).toContain("-X GET");
  });
});
