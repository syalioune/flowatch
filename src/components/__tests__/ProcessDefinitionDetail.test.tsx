// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <ProcessDefinitionDetail> (Story 20.1).
 *
 * Targets the inline Edit-category affordance + modal mount per AC-11:
 *   - The Edit button on the Category row renders with the right testid.
 *   - Clicking the Edit button opens <EditCategoryModal>.
 *   - On modal success, the parent's `reload` prop fires (the prop contract
 *     is the source of truth for the post-success refresh).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableProcessDefinition } from "../../api";
import { ProcessDefinitionDetail } from "../ProcessDefinitionDetail";

// TanStack Router stubs — ProcessDefinitionDetail uses <Link>; the embedded
// <PageHead> reads route-meta via useRouterState. Stub both so the test
// doesn't need a RouterProvider.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a {...(rest as Record<string, unknown>)}>{children}</a>
  ),
  // useRouterState is called with `{ select }`; return the select() result so
  // PageHead's route-meta lookup degrades gracefully to an empty endpoints array.
  useRouterState: (opts: { select?: (s: unknown) => unknown }) => {
    const state = { matches: [{ staticData: {} }] };
    return opts?.select ? opts.select(state) : state;
  },
}));

type Host = {
  getProcessDefinitionResource: (id: string) => Promise<string>;
  updateProcessDefinition: (
    id: string,
    fields: Partial<{ category: string }>,
  ) => Promise<FlowableProcessDefinition>;
};

const DEF: FlowableProcessDefinition = {
  id: "def-1",
  key: "loanApproval",
  name: "Loan approval",
  version: 1,
  deploymentId: "dep-1",
  category: "finance",
  suspended: false,
};

describe("<ProcessDefinitionDetail> — Story 20.1 Edit-category surface", () => {
  const realResource = api.getProcessDefinitionResource;
  const realUpdate = api.updateProcessDefinition;
  let resourceSpy: ReturnType<typeof vi.fn>;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resourceSpy = vi.fn().mockResolvedValue("<bpmn />");
    updateSpy = vi.fn();
    (api as unknown as Host).getProcessDefinitionResource =
      resourceSpy as unknown as typeof api.getProcessDefinitionResource;
    (api as unknown as Host).updateProcessDefinition =
      updateSpy as unknown as typeof api.updateProcessDefinition;
  });

  afterEach(() => {
    (api as unknown as Host).getProcessDefinitionResource = realResource;
    (api as unknown as Host).updateProcessDefinition = realUpdate;
    cleanup();
  });

  it("renders the Category row with the Edit button (AC-4)", async () => {
    render(<ProcessDefinitionDetail definition={DEF} reload={() => undefined} />);
    const btn = await screen.findByTestId("edit-category-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Edit");
    // The category value is still rendered in the same row.
    expect(screen.getByText("finance")).toBeInTheDocument();
  });

  it("renders the mute fallback when category is empty + still shows the Edit button", async () => {
    const { category: _omit, ...rest } = DEF;
    const def: FlowableProcessDefinition = rest;
    render(<ProcessDefinitionDetail definition={def} reload={() => undefined} />);
    // Target the Category cell specifically — the Tenant row also renders an
    // em-dash for un-tenanted definitions, so a global getAllByText("—") is
    // satisfied regardless of what the Category cell contains.
    const button = await screen.findByTestId("edit-category-button");
    const categoryCell = button.closest("td");
    expect(categoryCell).not.toBeNull();
    expect(categoryCell).toHaveTextContent("—");
    expect(categoryCell).toHaveTextContent("Edit");
  });

  it("disables the Edit button when the definition is suspended", async () => {
    // Engine acceptance of PUT {category} on a suspended definition is
    // unverified; gate the affordance to avoid an avoidable engine round-trip.
    const suspendedDef: FlowableProcessDefinition = { ...DEF, suspended: true };
    render(<ProcessDefinitionDetail definition={suspendedDef} reload={() => undefined} />);
    const btn = await screen.findByTestId("edit-category-button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("title", "Reactivate the definition to edit its category");
  });

  it("clicking the Edit button opens <EditCategoryModal> (AC-4)", async () => {
    const user = userEvent.setup();
    render(<ProcessDefinitionDetail definition={DEF} reload={() => undefined} />);
    expect(screen.queryByTestId("edit-category-modal")).not.toBeInTheDocument();
    await user.click(await screen.findByTestId("edit-category-button"));
    expect(await screen.findByTestId("edit-category-modal")).toBeInTheDocument();
  });

  it("fires the reload prop on successful modal submit (AC-5)", async () => {
    updateSpy.mockResolvedValue({ ...DEF, category: "accounting" });
    const reload = vi.fn();
    const user = userEvent.setup();
    render(<ProcessDefinitionDetail definition={DEF} reload={reload} />);
    await user.click(await screen.findByTestId("edit-category-button"));
    const input = await screen.findByTestId("edit-category-input");
    await user.clear(input);
    await user.type(input, "accounting");
    await user.click(screen.getByTestId("edit-category-submit"));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith("def-1", { category: "accounting" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("closes the modal after a successful edit (retryable-creation contract)", async () => {
    updateSpy.mockResolvedValue({ ...DEF, category: "accounting" });
    const user = userEvent.setup();
    render(<ProcessDefinitionDetail definition={DEF} reload={() => undefined} />);
    await user.click(await screen.findByTestId("edit-category-button"));
    await screen.findByTestId("edit-category-modal");
    await user.click(screen.getByTestId("edit-category-submit"));
    await waitFor(() =>
      expect(screen.queryByTestId("edit-category-modal")).not.toBeInTheDocument(),
    );
  });
});
