// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <EditVariableModal> + helpers (Story 19.1).
 *
 * Covers the pure helpers (coerceVariableValue, renderInitialValue) and the
 * modal's retryable-creation contract — close-on-success, stay-open-on-error,
 * triggerRef focus-restore, ARIA on day one (Epic 18.2 codification).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import {
  coerceVariableValue,
  EditVariableModal,
  renderInitialValue,
  VARIABLE_TYPES,
} from "../edit-variable-modal";

describe("VARIABLE_TYPES", () => {
  it("covers the engine's supported variable type set", () => {
    expect(VARIABLE_TYPES).toEqual([
      "string",
      "integer",
      "long",
      "double",
      "boolean",
      "short",
      "json",
      "date",
    ]);
  });
});

describe("coerceVariableValue", () => {
  it("coerces integer types via Number()", () => {
    expect(coerceVariableValue("100", "integer")).toBe(100);
    expect(coerceVariableValue("-3", "long")).toBe(-3);
    expect(coerceVariableValue("4.2", "double")).toBe(4.2);
    expect(coerceVariableValue("7", "short")).toBe(7);
  });

  it("falls back to the raw string when the number is not finite (engine validates)", () => {
    expect(coerceVariableValue("abc", "integer")).toBe("abc");
  });

  it("returns empty input as-is for numeric types (engine handles)", () => {
    expect(coerceVariableValue("", "integer")).toBe("");
  });

  it("coerces boolean via case-insensitive 'true'/'false' literal match", () => {
    expect(coerceVariableValue("true", "boolean")).toBe(true);
    expect(coerceVariableValue("false", "boolean")).toBe(false);
    expect(coerceVariableValue("True", "boolean")).toBe(true);
    expect(coerceVariableValue("TRUE", "boolean")).toBe(true);
    expect(coerceVariableValue("False", "boolean")).toBe(false);
    expect(coerceVariableValue("  true  ", "boolean")).toBe(true);
    expect(coerceVariableValue("yes", "boolean")).toBe("yes");
  });

  it("parses json text via JSON.parse, falls back to raw on parse error", () => {
    expect(coerceVariableValue('{"a":1}', "json")).toEqual({ a: 1 });
    expect(coerceVariableValue("not json", "json")).toBe("not json");
  });

  it("returns the raw string verbatim for string / date / unknown types", () => {
    expect(coerceVariableValue("hello", "string")).toBe("hello");
    expect(coerceVariableValue("2026-05-28T00:00:00.000Z", "date")).toBe(
      "2026-05-28T00:00:00.000Z",
    );
    expect(coerceVariableValue("x", "binary")).toBe("x");
  });
});

describe("renderInitialValue", () => {
  it("returns empty string for null / undefined", () => {
    expect(renderInitialValue(null, "string")).toBe("");
    expect(renderInitialValue(undefined, "integer")).toBe("");
  });

  it("renders strings unquoted", () => {
    expect(renderInitialValue("hello", "string")).toBe("hello");
  });

  it("pretty-prints json with two-space indent", () => {
    expect(renderInitialValue({ a: 1 }, "json")).toBe('{\n  "a": 1\n}');
  });

  it("falls back to String() for json that fails to serialize", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(renderInitialValue(circular, "json")).toBe("[object Object]");
  });

  it("renders other types via String(value)", () => {
    expect(renderInitialValue(42, "integer")).toBe("42");
    expect(renderInitialValue(true, "boolean")).toBe("true");
  });
});

describe("<EditVariableModal>", () => {
  const realUpdate = api.updateInstanceVariables;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSpy = vi.fn();
    (
      api as unknown as { updateInstanceVariables: typeof api.updateInstanceVariables }
    ).updateInstanceVariables = updateSpy as unknown as typeof api.updateInstanceVariables;
  });

  afterEach(() => {
    (
      api as unknown as { updateInstanceVariables: typeof api.updateInstanceVariables }
    ).updateInstanceVariables = realUpdate;
    cleanup();
  });

  it("renders nothing when variable is null", () => {
    const { container } = render(
      <EditVariableModal variable={null} instanceId="pi-1" onClose={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit variable" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "edit-variable-title");
  });

  it("hydrates the form from variable.type / value / scope", async () => {
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer", scope: "local" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    await screen.findByText("Edit variable");
    expect(screen.getByTestId("edit-variable-type")).toHaveValue("integer");
    expect(screen.getByTestId("edit-variable-value")).toHaveValue("1000");
    expect(screen.getByLabelText("local")).toBeChecked();
  });

  it("submits the array body and closes on success (retryable-creation contract)", async () => {
    updateSpy.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    const valueField = await screen.findByTestId("edit-variable-value");
    await user.clear(valueField);
    await user.type(valueField, "100");
    await user.click(screen.getByTestId("edit-variable-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("pi-1", [
      { name: "amount", value: 100, type: "integer" },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open on engine failure + renders verbatim ErrorBox + preserves form", async () => {
    updateSpy.mockRejectedValue(new FlowableError("ActivitiIllegalArgumentException", 400));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
      />,
    );
    const valueField = await screen.findByTestId("edit-variable-value");
    await user.clear(valueField);
    await user.type(valueField, "abc");
    await user.click(screen.getByTestId("edit-variable-submit"));
    await waitFor(() =>
      expect(screen.getByText("ActivitiIllegalArgumentException")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
    // Form value preserved across the failed submit.
    expect(screen.getByTestId("edit-variable-value")).toHaveValue("abc");
    expect(screen.getByTestId("edit-variable-modal")).toBeInTheDocument();
  });

  it("sends scope: 'local' only when the operator picks local", async () => {
    updateSpy.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer", scope: "global" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    await screen.findByText("Edit variable");
    await user.click(screen.getByTestId("edit-variable-submit"));
    expect(updateSpy.mock.calls[0]?.[1]?.[0]).not.toHaveProperty("scope");
    updateSpy.mockClear();
    await user.click(screen.getByLabelText("local"));
    await user.click(screen.getByTestId("edit-variable-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0]?.[1]?.[0]).toMatchObject({ scope: "local" });
  });

  it("Cancel closes the modal without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Edit";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
        triggerRef={triggerRef}
      />,
    );
    await screen.findByText("Edit variable");
    await user.click(screen.getByTestId("edit-variable-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EditVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
      />,
    );
    await screen.findByText("Edit variable");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prepends an option for an unknown variable.type so the select stays controlled", async () => {
    render(
      <EditVariableModal
        variable={{ name: "blob", value: "<bytes>", type: "binary" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    const select = (await screen.findByTestId("edit-variable-type")) as HTMLSelectElement;
    expect(select.value).toBe("binary");
    // The unknown type shows as the first option (prepended) plus all 8 standard
    // types → 9 options total.
    expect(select.querySelectorAll("option").length).toBe(VARIABLE_TYPES.length + 1);
    expect(select.querySelector('option[value="binary"]')).not.toBeNull();
  });

  it("switches the value input between <textarea> (string/json) and <input> (scalars)", async () => {
    const user = userEvent.setup();
    render(
      <EditVariableModal
        variable={{ name: "v", value: "hi", type: "string" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    let valueField = await screen.findByTestId("edit-variable-value");
    expect(valueField.tagName).toBe("TEXTAREA");
    await user.selectOptions(screen.getByTestId("edit-variable-type"), "integer");
    valueField = screen.getByTestId("edit-variable-value");
    expect(valueField.tagName).toBe("INPUT");
  });
});
