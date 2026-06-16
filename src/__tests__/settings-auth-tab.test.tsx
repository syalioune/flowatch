// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for the Story 28.2 Settings → Authentication tab.
 *
 * Drives the real saved-connections localStorage path + the real api funnel
 * (Pattern P-009 — no vi.mock(api)). Asserts the tab renders, hydrates from the
 * active connection, validates + persists + installs on Save, and disables Save
 * when the config is unchanged.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../api";
import { SettingsModal } from "../components";
import { BasicAuthStrategy } from "../lib/auth-strategy";
import { loadConnections, type SavedConnectionsState, STORAGE_KEY } from "../lib/saved-connections";

const seedBasic = () => {
  const state: SavedConnectionsState = {
    schemaVersion: 2,
    activeId: "c1",
    connections: [
      {
        id: "c1",
        label: "Staging",
        baseUrl: "http://localhost:8080/flowable-rest/service",
        username: "u",
        password: "p",
        tenantId: "",
        authStrategyConfig: { kind: "basic", config: { username: "u", password: "p" } },
      },
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

beforeEach(() => {
  localStorage.clear();
  seedBasic();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  api.setAuthStrategy(
    new BasicAuthStrategy(() => {
      const c = api.config();
      return { username: c.username, password: c.password };
    }),
  );
});

const openAuthTab = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("settings-tab-authentication"));
};

describe("Settings → Authentication tab", () => {
  it("renders the tab button and the active connection label", async () => {
    const user = userEvent.setup();
    render(<SettingsModal open onClose={() => undefined} />);
    await openAuthTab(user);
    expect(screen.getByTestId("auth-tab-active-label")).toHaveTextContent(
      "Authentication for: Staging",
    );
  });

  it("hydrates the segmented-control from the active connection (basic)", async () => {
    const user = userEvent.setup();
    render(<SettingsModal open onClose={() => undefined} />);
    await openAuthTab(user);
    expect(screen.getByTestId("auth-kind-basic")).toHaveAttribute("aria-pressed", "true");
  });

  it("Save is disabled when the config is unchanged (diff-empty guard)", async () => {
    const user = userEvent.setup();
    render(<SettingsModal open onClose={() => undefined} />);
    await openAuthTab(user);
    expect(screen.getByTestId("auth-tab-save")).toBeDisabled();
  });

  it("OIDC with an invalid issuer renders an in-tab ErrorBox (nothing persisted)", async () => {
    const user = userEvent.setup();
    render(<SettingsModal open onClose={() => undefined} />);
    await openAuthTab(user);
    await user.click(screen.getByTestId("auth-kind-oidc"));
    await user.type(screen.getByTestId("auth-oidc-issuer"), "not-a-url");
    await user.type(screen.getByTestId("auth-oidc-client-id"), "cid");
    await user.type(screen.getByTestId("auth-oidc-scopes"), "openid");
    await user.click(screen.getByTestId("auth-tab-save"));
    expect(await screen.findByTestId("auth-tab-error")).toBeInTheDocument();
    // Persisted config unchanged (still basic).
    const persisted = loadConnections().connections[0]?.authStrategyConfig;
    expect(persisted?.kind).toBe("basic");
  });

  it("switching to Bearer + Save persists bearer config + installs the strategy", async () => {
    const user = userEvent.setup();
    render(<SettingsModal open onClose={() => undefined} />);
    await openAuthTab(user);
    await user.click(screen.getByTestId("auth-kind-bearer"));
    await user.type(screen.getByTestId("auth-bearer-token"), "tok-abc");
    await user.click(screen.getByTestId("auth-tab-save"));
    await waitFor(() => {
      const persisted = loadConnections().connections[0]?.authStrategyConfig;
      expect(persisted?.kind).toBe("bearer");
    });
    expect(api.getAuthStrategy().kind).toBe("bearer");
  });

  it("switching to OIDC with valid config + Save persists oidc config", async () => {
    const user = userEvent.setup();
    render(<SettingsModal open onClose={() => undefined} />);
    await openAuthTab(user);
    await user.click(screen.getByTestId("auth-kind-oidc"));
    await user.type(screen.getByTestId("auth-oidc-issuer"), "https://idp.test");
    await user.type(screen.getByTestId("auth-oidc-client-id"), "cid");
    await user.type(screen.getByTestId("auth-oidc-scopes"), "openid, offline_access");
    await user.click(screen.getByTestId("auth-tab-save"));
    await waitFor(() => {
      const persisted = loadConnections().connections[0]?.authStrategyConfig;
      expect(persisted?.kind).toBe("oidc");
    });
    const persisted = loadConnections().connections[0]?.authStrategyConfig;
    expect(persisted?.kind === "oidc" && persisted.config.issuer).toBe("https://idp.test");
  });
});
