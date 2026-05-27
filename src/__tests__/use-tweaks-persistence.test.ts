// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTweaks } from "../tweaks-panel";

// Widen to plain string to match the production call site at src/app.tsx
// (where `TWEAK_DEFAULTS` is declared without `as const`), so the hook's
// generic T resolves to a string-valued shape and setTweak accepts any
// string value per key. Tests against `as const` would constrain T to
// literal types and reject the test mutations.
type TweakValues = {
  look: string;
  theme: string;
  density: string;
  accent: string;
};

const DEFAULTS: TweakValues = {
  look: "editorial",
  theme: "light",
  density: "regular",
  accent: "default",
};

describe("useTweaks localStorage round-trip (Story 17.2 AC-5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when localStorage is empty", () => {
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("rehydrates from localStorage on mount", () => {
    localStorage.setItem(
      "flowatch.tweaks.v1",
      JSON.stringify({ look: "industrial", theme: "dark" }),
    );
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    expect(result.current[0]).toEqual({ ...DEFAULTS, look: "industrial", theme: "dark" });
  });

  it("writes to localStorage on setTweak(key, value)", () => {
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    act(() => result.current[1]("look", "terminal"));
    const stored = JSON.parse(localStorage.getItem("flowatch.tweaks.v1") ?? "{}");
    expect(stored.look).toBe("terminal");
    expect(stored.theme).toBe("light");
  });

  it("writes to localStorage on setTweak(edits-object)", () => {
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    act(() => result.current[1]({ look: "terminal", density: "compact" }));
    const stored = JSON.parse(localStorage.getItem("flowatch.tweaks.v1") ?? "{}");
    expect(stored.look).toBe("terminal");
    expect(stored.density).toBe("compact");
  });

  it("ignores unknown stored keys (merge-over-defaults shape)", () => {
    localStorage.setItem(
      "flowatch.tweaks.v1",
      JSON.stringify({ look: "industrial", motion: "reduced" }),
    );
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    expect(result.current[0]).toEqual({ ...DEFAULTS, look: "industrial" });
    expect((result.current[0] as Record<string, unknown>).motion).toBeUndefined();
  });

  it("falls back to defaults on JSON parse error", () => {
    localStorage.setItem("flowatch.tweaks.v1", "{not-json");
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("falls back to defaults on non-object stored value", () => {
    localStorage.setItem("flowatch.tweaks.v1", JSON.stringify("garbage"));
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it("falls back to defaults on null stored value", () => {
    localStorage.setItem("flowatch.tweaks.v1", JSON.stringify(null));
    const { result } = renderHook(() => useTweaks(DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });
});
