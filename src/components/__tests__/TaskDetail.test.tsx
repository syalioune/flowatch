// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <TaskDetail> — Story 11.4 surface (Resolve button +
 * Delegate-via-modal). The Claim and Complete legacy buttons are
 * exercised indirectly via the route-mount flow; we focus here on the
 * 11.4 contractual paths called out in AC-5 / AC-8:
 *
 *   - Resolve visibility predicate (3 cases: visible / not assignee /
 *     no distinct owner).
 *   - Resolve success path (api.taskAction("resolve") + ok toast + reload
 *     + nav:invalidate-counts dispatch).
 *   - Resolve failure path (err toast with verbatim message + reload-anyway).
 *   - Delegate button opens the new modal (not the legacy prompt()).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableTask, type FlowableTaskForm, type FlowableVariable } from "../../api";
import { TaskDetail } from "../TaskDetail";

// TanStack Router stubs — TaskDetail uses useNavigate + Link, and PageHead
// reads route-meta via useRouterState. Stub all three so the test doesn't
// need a RouterProvider.
const navigateSpy = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateSpy,
  // useRouterState is called with `{ select }`; return the select() result so
  // PageHead's route-meta lookup degrades gracefully to an empty endpoints array.
  useRouterState: (opts: { select?: (s: unknown) => unknown }) => {
    const state = { matches: [{ staticData: {} }] };
    return opts?.select ? opts.select(state) : state;
  },
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a {...(rest as Record<string, unknown>)}>{children}</a>
  ),
}));

// TaskFormPanel does its own getTaskForm fetch + renders a panel; for the
// purposes of TaskDetail tests we don't care about its internals, so we
// short-circuit it via a vi.mock that renders a marker div. The parent's
// own getTaskForm spy still fires.
vi.mock("../TaskFormPanel", () => ({
  TaskFormPanel: () => <div data-testid="task-form-panel-stub" />,
}));

type Host = {
  getTaskForm: (taskId: string) => Promise<FlowableTaskForm | null>;
  getTaskVariables: (taskId: string) => Promise<FlowableVariable[]>;
  taskAction: (id: string, action: string, body?: Record<string, unknown>) => Promise<FlowableTask>;
  config: () => { baseUrl: string; username: string; password: string; tenantId: string };
};

const collectToasts = () => {
  const toasts: Array<{ kind?: string; text: string; sub?: string }> = [];
  const handler = (e: Event) => {
    toasts.push((e as CustomEvent<{ kind?: string; text: string; sub?: string }>).detail);
  };
  window.addEventListener("app:toast", handler as EventListener);
  return {
    toasts,
    dispose: () => window.removeEventListener("app:toast", handler as EventListener),
  };
};

const baseTask: FlowableTask = {
  id: "task-1",
  name: "Approve loan",
  priority: 50,
  createTime: "2026-05-25T12:00:00.000Z",
};

describe("<TaskDetail> — Story 11.4 surface", () => {
  const realGetForm = api.getTaskForm;
  const realGetVars = api.getTaskVariables;
  const realTaskAction = api.taskAction;
  const realConfig = api.config;
  let getFormSpy: ReturnType<typeof vi.fn>;
  let getVarsSpy: ReturnType<typeof vi.fn>;
  let taskActionSpy: ReturnType<typeof vi.fn>;
  let toastCollector: ReturnType<typeof collectToasts>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getFormSpy = vi.fn().mockResolvedValue(null);
    getVarsSpy = vi.fn().mockResolvedValue([]);
    taskActionSpy = vi.fn();
    reload = vi.fn();
    (api as unknown as Host).getTaskForm = getFormSpy as unknown as Host["getTaskForm"];
    (api as unknown as Host).getTaskVariables = getVarsSpy as unknown as Host["getTaskVariables"];
    (api as unknown as Host).taskAction = taskActionSpy as unknown as Host["taskAction"];
    (api as unknown as Host).config = () => ({
      baseUrl: "http://x/y",
      username: "rest-admin",
      password: "p",
      tenantId: "",
    });
    toastCollector = collectToasts();
    navigateSpy.mockClear();
  });

  afterEach(() => {
    (api as unknown as Host).getTaskForm = realGetForm as unknown as Host["getTaskForm"];
    (api as unknown as Host).getTaskVariables = realGetVars as unknown as Host["getTaskVariables"];
    (api as unknown as Host).taskAction = realTaskAction as unknown as Host["taskAction"];
    (api as unknown as Host).config = realConfig;
    toastCollector.dispose();
    cleanup();
  });

  describe("Resolve visibility predicate", () => {
    it("renders Resolve when assignee === cfg.username AND owner is set AND owner !== assignee", () => {
      render(
        <TaskDetail
          task={{ ...baseTask, assignee: "rest-admin", owner: "kermit" }}
          reload={reload}
        />,
      );
      expect(screen.getByTestId("resolve-task")).toBeInTheDocument();
    });

    it("HIDES Resolve when cfg.username is not the assignee", () => {
      render(
        <TaskDetail
          task={{ ...baseTask, assignee: "kermit", owner: "rest-admin" }}
          reload={reload}
        />,
      );
      expect(screen.queryByTestId("resolve-task")).toBeNull();
    });

    it("HIDES Resolve when owner is missing", () => {
      render(<TaskDetail task={{ ...baseTask, assignee: "rest-admin" }} reload={reload} />);
      expect(screen.queryByTestId("resolve-task")).toBeNull();
    });

    it("HIDES Resolve when owner equals assignee (no delegation in flight)", () => {
      render(
        <TaskDetail
          task={{ ...baseTask, assignee: "rest-admin", owner: "rest-admin" }}
          reload={reload}
        />,
      );
      expect(screen.queryByTestId("resolve-task")).toBeNull();
    });
  });

  describe("Resolve handler", () => {
    it("success path: api.taskAction('resolve') + ok toast + reload + nav-event", async () => {
      const user = userEvent.setup();
      taskActionSpy.mockResolvedValue(baseTask);
      const navEvents: string[] = [];
      const navHandler = (e: Event) => navEvents.push(e.type);
      window.addEventListener("nav:invalidate-counts", navHandler);
      try {
        render(
          <TaskDetail
            task={{ ...baseTask, assignee: "rest-admin", owner: "kermit" }}
            reload={reload}
          />,
        );
        await user.click(screen.getByTestId("resolve-task"));
        await waitFor(() => expect(taskActionSpy).toHaveBeenCalledWith("task-1", "resolve"));
        expect(navEvents).toContain("nav:invalidate-counts");
        expect(reload).toHaveBeenCalledTimes(1);
        expect(toastCollector.toasts.some((t) => t.kind === "ok" && /Resolved:/.test(t.text))).toBe(
          true,
        );
      } finally {
        window.removeEventListener("nav:invalidate-counts", navHandler);
      }
    });

    it("failure path: err toast with verbatim sub + reload still runs (engine is source of truth)", async () => {
      const user = userEvent.setup();
      taskActionSpy.mockRejectedValue(new Error("already resolved"));
      render(
        <TaskDetail
          task={{ ...baseTask, assignee: "rest-admin", owner: "kermit" }}
          reload={reload}
        />,
      );
      await user.click(screen.getByTestId("resolve-task"));
      await waitFor(() => expect(taskActionSpy).toHaveBeenCalledTimes(1));
      expect(reload).toHaveBeenCalledTimes(1);
      const errToast = toastCollector.toasts.find((t) => t.kind === "err");
      expect(errToast?.text).toBe("Resolve failed");
      expect(errToast?.sub).toBe("already resolved");
    });
  });

  describe("Delegate button", () => {
    it("opens the new DelegateTaskModal (not the legacy prompt)", async () => {
      const user = userEvent.setup();
      // Ensure prompt() is not called.
      const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
      try {
        render(<TaskDetail task={baseTask} reload={reload} />);
        await user.click(screen.getByRole("button", { name: /Delegate/ }));
        // Modal opens with the documented testid.
        await waitFor(() => expect(screen.getByTestId("delegate-task-modal")).toBeInTheDocument());
        expect(promptSpy).not.toHaveBeenCalled();
      } finally {
        promptSpy.mockRestore();
      }
    });
  });
});
