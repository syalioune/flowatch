// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for <ConnectionSwitch> (Story 23.1 — FR-49).
 * Asserts the Topbar chip + popover listbox behaviour.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addConnection, loadConnections } from "../../lib/saved-connections";
import { ConnectionSwitch } from "../ConnectionSwitch";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("<ConnectionSwitch>", () => {
  it("renders the active label", async () => {
    loadConnections();
    render(<ConnectionSwitch onSettings={() => undefined} />);
    const label = await screen.findByTestId("connection-switch-label");
    expect(label).toHaveTextContent("Default");
  });

  it("clicking the chip opens the popover (aria-expanded flips)", async () => {
    loadConnections();
    const user = userEvent.setup();
    render(<ConnectionSwitch onSettings={() => undefined} />);
    const chip = await screen.findByTestId("connection-switch");
    expect(chip).toHaveAttribute("aria-expanded", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("connection-picker-popover")).toBeInTheDocument();
  });

  it("popover lists every saved connection with aria-selected on active", async () => {
    loadConnections();
    const added = addConnection({
      label: "Stage",
      baseUrl: "http://stage/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(<ConnectionSwitch onSettings={() => undefined} />);
    await user.click(await screen.findByTestId("connection-switch"));
    const stageOption = await screen.findByTestId(`connection-option-${added.id}`);
    expect(stageOption).toHaveAttribute("aria-selected", "false");
    const activeId = loadConnections().activeId;
    expect(activeId).not.toBe(added.id);
    const defaultOption = screen.getByTestId(`connection-option-${activeId}`);
    expect(defaultOption).toHaveAttribute("aria-selected", "true");
  });

  it("picking a connection updates the chip label + closes the popover", async () => {
    loadConnections();
    const added = addConnection({
      label: "Stage",
      baseUrl: "http://stage/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(<ConnectionSwitch onSettings={() => undefined} />);
    await user.click(await screen.findByTestId("connection-switch"));
    await user.click(await screen.findByTestId(`connection-option-${added.id}`));
    await waitFor(() =>
      expect(screen.queryByTestId("connection-picker-popover")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("connection-switch-label")).toHaveTextContent("Stage");
  });

  it("Esc closes the popover", async () => {
    loadConnections();
    const user = userEvent.setup();
    render(<ConnectionSwitch onSettings={() => undefined} />);
    await user.click(await screen.findByTestId("connection-switch"));
    expect(screen.getByTestId("connection-picker-popover")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("connection-picker-popover")).not.toBeInTheDocument(),
    );
  });

  it("Manage connections footer button calls onSettings", async () => {
    loadConnections();
    const onSettings = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionSwitch onSettings={onSettings} />);
    await user.click(await screen.findByTestId("connection-switch"));
    await user.click(await screen.findByTestId("open-manage-connections"));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
