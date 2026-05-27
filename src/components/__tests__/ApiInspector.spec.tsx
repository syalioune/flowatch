// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest browser-tier suite for <ApiInspector>.
 *
 * Runs in real Chromium via Vitest's Playwright provider so animations,
 * scrollIntoView, and the api:log CustomEvent path are exercised the same
 * way as in production. Per Pattern P-009: we mock the engine surface
 * (API_LOG seed) rather than vi.mock(api).
 *
 * Story 8.2 cases:
 *   1. Drawer mounts open when open={true}.
 *   2. Method filter narrows the row list.
 *   3. Status filter narrows the row list.
 *   4. Empty-after-filter shows the dedicated copy.
 *   5. Row expansion toggles; only one row expanded at a time.
 *   6. Expanded row renders the Authorization: Basic *** header.
 *   7. AC-10 — single listener pair per mount (no api:log duplication).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, type ApiLogEntry } from "../../api";
import { ApiInspector } from "../../components";

function seed(entries: Partial<ApiLogEntry>[]): void {
  API_LOG.length = 0;
  for (const e of entries) {
    API_LOG.unshift({
      id: e.id ?? Math.random().toString(36).slice(2, 9),
      method: e.method ?? "GET",
      path: e.path ?? "/probe",
      url: e.url ?? `http://localhost:8080${e.path ?? "/probe"}`,
      status: e.status ?? 200,
      ms: e.ms ?? 12,
      at: e.at ?? new Date().toISOString(),
      ...(e.headers !== undefined && { headers: e.headers }),
      ...(e.body !== undefined && { body: e.body }),
      ...(e.error !== undefined && { error: e.error }),
    });
  }
}

describe("<ApiInspector> (Story 8.2)", () => {
  beforeEach(() => {
    API_LOG.length = 0;
  });
  afterEach(() => {
    cleanup();
  });

  it("renders drawer in open state with data-open=1", () => {
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    const drawer = document.querySelector(".drawer");
    expect(drawer).not.toBeNull();
    expect(drawer).toHaveAttribute("data-open", "1");
  });

  it("method filter limits the list to matching rows", async () => {
    seed([
      { id: "a", method: "GET", path: "/a" },
      { id: "b", method: "POST", path: "/b" },
      { id: "c", method: "DELETE", path: "/c" },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.selectOptions(screen.getByLabelText("Filter by HTTP method"), "POST");

    const rows = document.querySelectorAll(".log-entry");
    expect(rows.length).toBe(1);
    expect(rows[0]).toHaveTextContent("POST");
    expect(rows[0]).toHaveTextContent("/b");
  });

  it("status filter limits the list by 2xx / 4xx / 5xx-err buckets", async () => {
    seed([
      { id: "ok", method: "GET", path: "/ok", status: 200 },
      { id: "nf", method: "GET", path: "/notfound", status: 404 },
      { id: "boom", method: "GET", path: "/boom", status: 500 },
      { id: "net", method: "GET", path: "/net", status: 0, error: "fetch failed" },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));

    // 4xx — should leave just the 404.
    await user.click(screen.getByRole("button", { name: "4xx" }));
    let rows = document.querySelectorAll(".log-entry");
    expect(rows.length).toBe(1);
    expect(rows[0]).toHaveTextContent("/notfound");

    // 5xx/err — should include both 500 and status 0.
    await user.click(screen.getByRole("button", { name: "5xx/err" }));
    rows = document.querySelectorAll(".log-entry");
    expect(rows.length).toBe(2);
    const paths = Array.from(rows).map((r) => r.textContent);
    expect(paths.some((p) => p?.includes("/boom"))).toBe(true);
    expect(paths.some((p) => p?.includes("/net"))).toBe(true);
  });

  it("shows the 'No calls match this filter.' copy when filters exclude everything", async () => {
    seed([{ id: "a", method: "GET", path: "/a", status: 200 }]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(screen.getByRole("button", { name: "5xx/err" }));

    expect(screen.getByText("No calls match this filter.")).toBeInTheDocument();
    expect(document.querySelectorAll(".log-entry").length).toBe(0);
  });

  it("toggles row expansion and ensures only one row is expanded at a time", async () => {
    seed([
      { id: "row-1", method: "GET", path: "/one", status: 200 },
      { id: "row-2", method: "POST", path: "/two", status: 201 },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));

    const row1 = document.querySelector('[data-entry-id="row-1"]') as HTMLElement;
    const row2 = document.querySelector('[data-entry-id="row-2"]') as HTMLElement;

    // Expand row 1.
    await user.click(row1);
    expect(row1).toHaveAttribute("data-expanded", "1");
    expect(document.querySelectorAll(".log-row-detail").length).toBe(1);

    // Click row 2 — row 1 collapses, row 2 expands.
    await user.click(row2);
    expect(row1).toHaveAttribute("data-expanded", "0");
    expect(row2).toHaveAttribute("data-expanded", "1");
    expect(document.querySelectorAll(".log-row-detail").length).toBe(1);

    // Click row 2 again — collapses.
    await user.click(row2);
    expect(row2).toHaveAttribute("data-expanded", "0");
    expect(document.querySelectorAll(".log-row-detail").length).toBe(0);
  });

  it("expanded row shows the redacted Authorization header and full URL", async () => {
    seed([
      {
        id: "redacted",
        method: "POST",
        path: "/runtime/process-instances",
        url: "http://localhost:8080/flowable-rest/service/runtime/process-instances",
        status: 201,
        headers: { Authorization: "Basic ***", "Content-Type": "application/json" },
        body: { processDefinitionId: "def-1" },
      },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(document.querySelector('[data-entry-id="redacted"]') as HTMLElement);

    const detail = document.querySelector(".log-row-detail") as HTMLElement;
    expect(detail).not.toBeNull();
    expect(within(detail).getByText(/Authorization: Basic \*\*\*/)).toBeInTheDocument();
    expect(within(detail).getByText(/Content-Type: application\/json/)).toBeInTheDocument();
    expect(detail).toHaveTextContent(
      "http://localhost:8080/flowable-rest/service/runtime/process-instances",
    );
    expect(detail).toHaveTextContent('"processDefinitionId": "def-1"');
  });

  it("(8.3) clicking Copy as curl writes the curl command to the clipboard and dispatches a success toast", async () => {
    seed([
      {
        id: "curl-row",
        method: "GET",
        path: "/repository/deployments",
        url: "http://localhost:8080/flowable-rest/service/repository/deployments",
        status: 200,
      },
    ]);
    const writeSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const toastSpy = vi.fn();
    window.addEventListener("app:toast", toastSpy as EventListener);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(document.querySelector('[data-entry-id="curl-row"]') as HTMLElement);
    await user.click(screen.getByTestId("copy-as-curl"));

    // Let the async onClick microtask drain.
    await new Promise((r) => setTimeout(r, 0));

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0]?.[0] as string).toMatch(/^curl -u 'rest-admin:test'/);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const ev = toastSpy.mock.calls[0]?.[0] as CustomEvent<{ kind?: string; text: string }>;
    expect(ev.detail.text).toBe("Copied curl command");
    expect(ev.detail.kind).toBe("ok");

    window.removeEventListener("app:toast", toastSpy as EventListener);
    writeSpy.mockRestore();
  });

  it("(8.3) Copy as curl failure path dispatches a 'Copy failed' toast with the error message", async () => {
    seed([
      {
        id: "curl-fail",
        method: "GET",
        path: "/probe",
        url: "http://localhost:8080/probe",
        status: 200,
      },
    ]);
    const writeSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("permission denied"));
    const toastSpy = vi.fn();
    window.addEventListener("app:toast", toastSpy as EventListener);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(document.querySelector('[data-entry-id="curl-fail"]') as HTMLElement);
    await user.click(screen.getByTestId("copy-as-curl"));

    await new Promise((r) => setTimeout(r, 0));

    expect(toastSpy).toHaveBeenCalledTimes(1);
    const ev = toastSpy.mock.calls[0]?.[0] as CustomEvent<{
      kind?: string;
      text: string;
      sub?: string;
    }>;
    expect(ev.detail.kind).toBe("bad");
    expect(ev.detail.text).toBe("Copy failed");
    expect(ev.detail.sub).toBe("permission denied");

    window.removeEventListener("app:toast", toastSpy as EventListener);
    writeSpy.mockRestore();
  });

  it("(8.3) multipart deploy entries hide the Copy as curl button and show a note instead", async () => {
    seed([
      {
        id: "multipart",
        method: "POST",
        path: "/repository/deployments",
        url: "http://localhost:8080/flowable-rest/service/repository/deployments",
        status: 201,
      },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(document.querySelector('[data-entry-id="multipart"]') as HTMLElement);

    expect(screen.queryByTestId("copy-as-curl")).toBeNull();
    expect(screen.getByText("Multipart upload — reproduce via the modeler")).toBeInTheDocument();
  });

  it("(13.4) renders an operator-readable truncation note when body is the captureBody envelope", async () => {
    const preview = '{"foo":"bar","largePayload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxx"}';
    seed([
      {
        id: "trunc-row",
        method: "POST",
        path: "/runtime/process-instances",
        url: "http://localhost:8080/flowable-rest/service/runtime/process-instances",
        status: 201,
        body: {
          __truncated: true,
          __originalBytes: 51_234,
          __preview: preview,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(document.querySelector('[data-entry-id="trunc-row"]') as HTMLElement);
    const detail = document.querySelector(".log-row-detail") as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail).toHaveTextContent("[body truncated: 51234 bytes total, showing first 16 KB]");
    // Preview content rendered alongside the note.
    expect(detail).toHaveTextContent('"foo":"bar"');
    expect(detail).toHaveTextContent('"largePayload"');
  });

  it("(13.4) preserves the existing JSON-stringified render for non-envelope bodies", async () => {
    seed([
      {
        id: "json-row",
        method: "POST",
        path: "/runtime/process-instances",
        url: "http://localhost:8080/flowable-rest/service/runtime/process-instances",
        status: 201,
        body: { processDefinitionId: "def-1" },
      },
    ]);
    const user = userEvent.setup();
    render(<ApiInspector open={true} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />);
    await user.click(screen.getByText("Recent calls"));
    await user.click(document.querySelector('[data-entry-id="json-row"]') as HTMLElement);
    const detail = document.querySelector(".log-row-detail") as HTMLElement;
    expect(detail).toHaveTextContent('"processDefinitionId": "def-1"');
    // Regression guard against false-positive envelope detection.
    expect(detail.textContent ?? "").not.toContain("[body truncated:");
  });

  it("registers exactly one api:log + one api:log-cleared listener per mount (AC-10)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <ApiInspector open={false} onClose={() => {}} screenEndpoints={[]} screenTitle="Test" />,
    );

    const adds = addSpy.mock.calls.filter(
      ([type]) => type === "api:log" || type === "api:log-cleared",
    );
    expect(adds.filter(([t]) => t === "api:log").length).toBe(1);
    expect(adds.filter(([t]) => t === "api:log-cleared").length).toBe(1);

    unmount();

    const removes = removeSpy.mock.calls.filter(
      ([type]) => type === "api:log" || type === "api:log-cleared",
    );
    expect(removes.filter(([t]) => t === "api:log").length).toBe(1);
    expect(removes.filter(([t]) => t === "api:log-cleared").length).toBe(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
