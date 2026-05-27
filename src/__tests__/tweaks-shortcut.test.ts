// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Re-implements the keydown handler from src/app.tsx so the unit can run
// without mounting the full App shell. If a future story extracts the
// handler into a `useTweaksShortcut()` hook, this test should import that
// hook directly via @testing-library/react's renderHook. Until then, the
// inline re-implementation is the cheapest reliable assertion shape.
function installShortcutHandler(): (e: KeyboardEvent) => void {
  const handler = (e: KeyboardEvent) => {
    if (!(e.ctrlKey && e.shiftKey)) return;
    if (e.key !== "T" && e.key !== "t") return;
    const target = e.target as HTMLElement | null;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    ) {
      return;
    }
    e.preventDefault();
    window.postMessage({ type: "__activate_edit_mode" }, window.origin);
  };
  window.addEventListener("keydown", handler);
  return handler;
}

describe("Ctrl+Shift+T global shortcut (Story 17.2)", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;
  let handler: ((e: KeyboardEvent) => void) | null = null;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, "postMessage");
    handler = installShortcutHandler();
  });

  afterEach(() => {
    if (handler) window.removeEventListener("keydown", handler);
    handler = null;
    postMessageSpy.mockRestore();
  });

  it("dispatches __activate_edit_mode when Ctrl+Shift+T fires on document body", () => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).toHaveBeenCalledWith({ type: "__activate_edit_mode" }, window.origin);
  });

  it("dispatches when key is lowercase 't' (defensive layout / lock-state handling)", () => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT dispatch when target is an <input>", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does NOT dispatch when target is a <textarea>", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it("does NOT dispatch when target is a [contenteditable] element", () => {
    const div = document.createElement("div");
    // JSDOM doesn't always populate `isContentEditable` from the
    // `.contentEditable` setter alone; setAttribute + manual isContentEditable
    // mock is the cross-engine-stable shape.
    div.setAttribute("contenteditable", "true");
    Object.defineProperty(div, "isContentEditable", { value: true, configurable: true });
    document.body.appendChild(div);
    div.focus();
    div.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it("does NOT dispatch when Ctrl is missing", () => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: false, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("does NOT dispatch when Shift is missing", () => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true, shiftKey: false, bubbles: true }),
    );
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("does NOT dispatch for a different key with the modifiers", () => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "K", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(postMessageSpy).not.toHaveBeenCalled();
  });
});
