// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for <EditConnectionModal> (Story 23.1) — 27th modal.
 * Diff-empty no-op Save-disabled guard inherited from Story 21.1.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditConnectionModal } from "../edit-connection-modal";
import { addConnection, loadConnections, type SavedConnection } from "../saved-connections";

const seed = (): SavedConnection => {
  loadConnections();
  return addConnection({
    label: "Stage",
    baseUrl: "http://stage/flowable-rest/service",
    username: "u",
    password: "p",
    tenantId: "t",
  });
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("<EditConnectionModal>", () => {
  it("renders nothing when connection is null", () => {
    const { container } = render(
      <EditConnectionModal
        open
        connection={null}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("ARIA contract (Epic 18.2)", async () => {
    const c = seed();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit connection" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "edit-connection-title");
  });

  it("pre-populates from connection.* and focuses Label", async () => {
    const c = seed();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const label = (await screen.findByTestId("edit-connection-label")) as HTMLInputElement;
    expect(label.value).toBe("Stage");
    expect((screen.getByTestId("edit-connection-base-url") as HTMLInputElement).value).toBe(
      "http://stage/flowable-rest/service",
    );
    expect((screen.getByTestId("edit-connection-tenant-id") as HTMLInputElement).value).toBe("t");
    await waitFor(() => expect(document.activeElement).toBe(label));
  });

  it("Save disabled when diff is empty (no changes)", async () => {
    const c = seed();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const submit = (await screen.findByTestId("edit-connection-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it("Save enabled when any field changes", async () => {
    const c = seed();
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const label = await screen.findByTestId("edit-connection-label");
    await user.clear(label);
    await user.type(label, "Renamed");
    const submit = (await screen.findByTestId("edit-connection-submit")) as HTMLButtonElement;
    expect(submit).not.toBeDisabled();
  });

  it("same-entry no-op label is accepted on submit", async () => {
    const c = seed();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <EditConnectionModal open connection={c} onClose={() => undefined} onSuccess={onSuccess} />,
    );
    const username = await screen.findByTestId("edit-connection-username");
    await user.clear(username);
    await user.type(username, "alice");
    await user.click(screen.getByTestId("edit-connection-submit"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const persisted = loadConnections().connections.find((x) => x.id === c.id);
    expect(persisted?.username).toBe("alice");
    expect(persisted?.label).toBe("Stage");
  });

  it("collision with OTHER entry → inline ErrorBox", async () => {
    seed();
    const other = addConnection({
      label: "Other",
      baseUrl: "http://o/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={other}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const label = await screen.findByTestId("edit-connection-label");
    await user.clear(label);
    await user.type(label, "Stage");
    await user.click(screen.getByTestId("edit-connection-submit"));
    await waitFor(() =>
      expect(screen.getByText(/Label 'Stage' is already in use/)).toBeInTheDocument(),
    );
  });

  it("invalid URL change → inline ErrorBox", async () => {
    const c = seed();
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const url = await screen.findByTestId("edit-connection-base-url");
    await user.clear(url);
    await user.type(url, "not-a-url");
    await user.click(screen.getByTestId("edit-connection-submit"));
    await waitFor(() => expect(screen.getByText("Invalid URL")).toBeInTheDocument());
  });

  it("Cancel restores triggerRef focus", async () => {
    const c = seed();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={onClose}
        onSuccess={() => undefined}
        triggerRef={triggerRef}
      />,
    );
    await user.click(await screen.findByTestId("edit-connection-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const c = seed();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EditConnectionModal open connection={c} onClose={onClose} onSuccess={() => undefined} />,
    );
    await screen.findByRole("heading", { name: "Edit connection" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hydrates segmented-control to Basic for connections without authStrategyConfig", async () => {
    const c = seed();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const basic = await screen.findByTestId("auth-kind-basic");
    expect(basic).toHaveAttribute("aria-pressed", "true");
  });

  it("Bearer-hydrated modal hides username/password inputs", async () => {
    loadConnections();
    const c = addConnection({
      label: "BHidden",
      baseUrl: "http://b/flowable-rest/service",
      tenantId: "",
      authStrategyConfig: { kind: "bearer", config: { token: "tok" } },
    });
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    await screen.findByTestId("auth-kind-bearer");
    expect(screen.queryByTestId("edit-connection-username")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-connection-password")).not.toBeInTheDocument();
  });

  it("switching kind=basic → kind=bearer drops persisted username/password (tombstone)", async () => {
    loadConnections();
    const c = addConnection({
      label: "ToFlip",
      baseUrl: "http://b/flowable-rest/service",
      username: "alice",
      password: "s3cret",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    await user.click(await screen.findByTestId("auth-kind-bearer"));
    await user.type(screen.getByTestId("auth-bearer-token"), "tok");
    await user.click(screen.getByTestId("edit-connection-submit"));
    await waitFor(() => {
      const persisted = loadConnections().connections.find((x) => x.id === c.id);
      expect(persisted?.username).toBeUndefined();
      expect(persisted?.password).toBeUndefined();
      expect(persisted?.authStrategyConfig?.kind).toBe("bearer");
    });
  });

  it("hydrates Bearer with the persisted token + populates textarea", async () => {
    loadConnections();
    const c = addConnection({
      label: "BTest",
      baseUrl: "http://b/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
      authStrategyConfig: { kind: "bearer", config: { token: "tok-xyz" } },
    });
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    expect((await screen.findByTestId("auth-kind-bearer")).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const ta = (await screen.findByTestId("auth-bearer-token")) as HTMLTextAreaElement;
    expect(ta.value).toBe("tok-xyz");
  });

  it("hydrates OIDC scopes joined with ', '", async () => {
    loadConnections();
    const c = addConnection({
      label: "OTest",
      baseUrl: "http://o/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
      authStrategyConfig: {
        kind: "oidc",
        config: {
          issuer: "https://idp.example.com",
          clientId: "flowatch",
          scopes: ["openid", "profile"],
        },
      },
    });
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    expect((await screen.findByTestId("auth-kind-oidc")).getAttribute("aria-pressed")).toBe("true");
    const scopes = (await screen.findByTestId("auth-oidc-scopes")) as HTMLInputElement;
    expect(scopes.value).toBe("openid, profile");
  });

  it("mode-switch enables Save even when other fields unchanged (diff-empty extended)", async () => {
    const c = seed();
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const submit = (await screen.findByTestId("edit-connection-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.click(screen.getByTestId("auth-kind-bearer"));
    await user.type(screen.getByTestId("auth-bearer-token"), "x");
    expect(submit).not.toBeDisabled();
  });

  it("submit without touching segmented-control preserves the original kind on the persisted entity", async () => {
    loadConnections();
    const c = addConnection({
      label: "BPersisted",
      baseUrl: "http://b/flowable-rest/service",
      tenantId: "",
      authStrategyConfig: { kind: "bearer", config: { token: "tok" } },
    });
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        open
        connection={c}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    // Bearer connection — username/password inputs are hidden; type into
    // the always-visible label to make the diff non-empty.
    const label = await screen.findByTestId("edit-connection-label");
    await user.clear(label);
    await user.type(label, "BPersisted v2");
    await user.click(screen.getByTestId("edit-connection-submit"));
    await waitFor(() => {
      const persisted = loadConnections().connections.find((x) => x.id === c.id);
      expect(persisted?.authStrategyConfig?.kind).toBe("bearer");
    });
  });
});
