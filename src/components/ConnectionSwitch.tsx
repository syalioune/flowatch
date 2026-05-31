// SPDX-License-Identifier: Apache-2.0

/**
 * Topbar `.connection-switch` chip + popover listbox (Story 23.1) — FR-49.
 *
 * Sits BEFORE the existing `.tenant-switch` chip (operator-feel: connection
 * scopes tenant; connection is broader). Click / Enter / Space opens a
 * popover with `role="listbox"` listing every saved connection. Picking one
 * calls `setActiveConnection(id)` which funnels through `api.setConfig` so
 * the existing `conn:config-changed` listener at [src/app.tsx](../app.tsx)
 * fires `probe()` against the new engine without bespoke wiring.
 *
 * Cycle-on-click was deliberately rejected — saved connections scale to
 * 5–10+ environments (dev's localhost + multiple staging + prod + per-team)
 * so cycling becomes a UX cliff at N>3. Popover listbox shape from day one.
 */

import React from "react";
import { Icon } from "../components";
import { SAVED_CONNECTIONS_CHANGED } from "../lib/nav-events";
import {
  loadConnections,
  type SavedConnection,
  type SavedConnectionsState,
  setActiveConnection,
} from "../lib/saved-connections";

export interface ConnectionSwitchProps {
  /** Opens the SettingsModal at the Connection tab (Manage section). */
  onSettings: () => void;
}

export const ConnectionSwitch: React.FC<ConnectionSwitchProps> = ({ onSettings }) => {
  const [state, setState] = React.useState<SavedConnectionsState>(() => loadConnections());
  const [open, setOpen] = React.useState(false);
  const chipRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handler = () => setState(loadConnections());
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, handler);
    return () => window.removeEventListener(SAVED_CONNECTIONS_CHANGED, handler);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (chipRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active: SavedConnection | null =
    state.activeId === null
      ? null
      : (state.connections.find((c) => c.id === state.activeId) ?? null);

  const pick = (id: string) => {
    try {
      setActiveConnection(id);
    } catch {
      /* missing-id is impossible from a listbox row whose id we just rendered */
    }
    setOpen(false);
  };

  const toggle = () => setOpen((o) => !o);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={chipRef}
        type="button"
        className="connection-switch"
        data-testid="connection-switch"
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onClick={toggle}
      >
        <Icon name="api" size={13} />
        <span>
          <b style={{ fontWeight: 500 }} data-testid="connection-switch-label">
            {active?.label ?? "Default"}
          </b>
        </span>
        <span className="caret">
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="connection-picker-popover"
          data-testid="connection-picker-popover"
        >
          {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA listbox pattern; ul/li carry the role semantics */}
          <ul role="listbox" aria-label="Saved connections">
            {state.connections.map((c) => (
              <li
                key={c.id}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA option inside listbox per WAI-ARIA combobox pattern
                role="option"
                aria-selected={c.id === state.activeId}
                data-testid={`connection-option-${c.id}`}
                tabIndex={0}
                onClick={() => pick(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(c.id);
                  }
                }}
              >
                <span className="conn-label">{c.label}</span>
                <span className="conn-baseurl mono">{c.baseUrl}</span>
              </li>
            ))}
          </ul>
          <div className="popover-footer">
            <button
              type="button"
              className="btn"
              data-testid="open-manage-connections"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            >
              Manage connections…
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
