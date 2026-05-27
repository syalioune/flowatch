// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "../components";

// Vitest config: globals=false, so @testing-library/react's auto-cleanup
// doesn't fire — call it explicitly to keep tests isolated.
afterEach(cleanup);

const baseProps = {
  tenant: { id: "", name: "All tenants" },
  tenants: [{ id: "", name: "All tenants" }],
  onTenant: () => undefined,
  theme: "light" as const,
  onTheme: () => undefined,
  onInspector: () => undefined,
  inspectorOpen: false,
  onSettings: () => undefined,
};

describe("Topbar palette button (Story 17.2 AC-3)", () => {
  it("renders with aria-label + data-testid + title (tooltip preserved)", () => {
    render(<Topbar {...baseProps} onTweaks={() => undefined} />);
    const btn = screen.getByTestId("tweaks-toggle");
    expect(btn).toHaveAttribute("aria-label", "Toggle theme tweaks (Ctrl+Shift+T)");
    expect(btn).toHaveAttribute("title", "Customize (Ctrl+Shift+T)");
  });

  it("invokes onTweaks exactly once when clicked", () => {
    const onTweaks = vi.fn();
    render(<Topbar {...baseProps} onTweaks={onTweaks} />);
    fireEvent.click(screen.getByTestId("tweaks-toggle"));
    expect(onTweaks).toHaveBeenCalledTimes(1);
  });
});
