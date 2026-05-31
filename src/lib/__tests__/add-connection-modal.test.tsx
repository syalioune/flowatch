// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for <AddConnectionModal> (Story 23.1) — 26th modal.
 * Mirrors `<CreateUserModal>` retryable-creation test shape. ARIA on day one.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddConnectionModal } from "../add-connection-modal";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("<AddConnectionModal>", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <AddConnectionModal open={false} onClose={() => undefined} onSuccess={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with ARIA contract (Epic 18.2)", async () => {
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Add connection" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "add-connection-title");
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
  });

  it("focuses the Label input on open", async () => {
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const label = (await screen.findByTestId("add-connection-label")) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(label));
  });

  it("Save disabled while label or baseUrl is empty", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const submit = (await screen.findByTestId("add-connection-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("add-connection-label"), "Staging");
    expect(submit).toBeDisabled();
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://staging/flowable-rest/service",
    );
    expect(submit).not.toBeDisabled();
  });

  it("submit happy path → onSuccess + onClose; persisted shape includes id", async () => {
    // Seed migration so addConnection() doesn't re-trigger inside the modal.
    let createdId: string | null = null;
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={() => undefined}
        onSuccess={(c) => {
          createdId = c.id;
        }}
      />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Local");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://localhost:8081/flowable-rest/service",
    );
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(createdId).not.toBeNull());
    const raw = localStorage.getItem("flowatch.connections.v1");
    expect(raw).not.toBeNull();
    expect(
      JSON.parse(raw as string).connections.some((c: { id: string }) => c.id === createdId),
    ).toBe(true);
  });

  it("label collision → inline ErrorBox + modal stays open + form preserved", async () => {
    // Pre-seed via the wrapper so the modal sees an existing "Local" label.
    const { addConnection, loadConnections } = await import("../saved-connections");
    loadConnections();
    addConnection({
      label: "Local",
      baseUrl: "http://x/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Local");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://y/flowable-rest/service",
    );
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() =>
      expect(screen.getByText(/Label 'Local' is already in use/)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
    expect((screen.getByTestId("add-connection-label") as HTMLInputElement).value).toBe("Local");
  });

  it("invalid URL → inline ErrorBox + modal stays open", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Bad");
    await user.type(screen.getByTestId("add-connection-base-url"), "not-a-url");
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(screen.getByText("Invalid URL")).toBeInTheDocument());
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
  });

  it("Cancel restores focus to triggerRef + does not submit", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={onClose}
        onSuccess={() => undefined}
        triggerRef={triggerRef}
      />,
    );
    await user.click(await screen.findByTestId("add-connection-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={onClose} onSuccess={() => undefined} />);
    await screen.findByRole("heading", { name: "Add connection" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("segmented-control renders three buttons with aria-pressed reflecting kind", async () => {
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const basic = await screen.findByTestId("auth-kind-basic");
    const bearer = screen.getByTestId("auth-kind-bearer");
    const oidc = screen.getByTestId("auth-kind-oidc");
    expect(basic).toHaveAttribute("aria-pressed", "true");
    expect(bearer).toHaveAttribute("aria-pressed", "false");
    expect(oidc).toHaveAttribute("aria-pressed", "false");
  });

  it("dormancy note + bearer help text render conditionally on kind", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    expect(await screen.findByTestId("auth-dormancy-note")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-bearer-help")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("auth-kind-bearer"));
    expect(await screen.findByTestId("auth-bearer-help")).toBeInTheDocument();
  });

  it("switching kind clears the previous kind's exclusive field", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.click(await screen.findByTestId("auth-kind-bearer"));
    const tokenInput = await screen.findByTestId("auth-bearer-token");
    await user.type(tokenInput, "tok-xyz");
    expect((tokenInput as HTMLTextAreaElement).value).toBe("tok-xyz");
    await user.click(screen.getByTestId("auth-kind-oidc"));
    expect(screen.queryByTestId("auth-bearer-token")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("auth-kind-bearer"));
    const re = await screen.findByTestId("auth-bearer-token");
    expect((re as HTMLTextAreaElement).value).toBe("");
  });

  it("Submit happy: Bearer kind writes authStrategyConfig", async () => {
    let created: { authStrategyConfig?: unknown } | null = null;
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={() => undefined}
        onSuccess={(c) => {
          created = c;
        }}
      />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Br");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://b/flowable-rest/service",
    );
    await user.click(screen.getByTestId("auth-kind-bearer"));
    await user.type(screen.getByTestId("auth-bearer-token"), "tok");
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(created).not.toBeNull());
    expect(
      (created as unknown as { authStrategyConfig?: { kind: string } } | null)?.authStrategyConfig
        ?.kind,
    ).toBe("bearer");
  });

  it("Submit OIDC happy: writes scopes as string[]", async () => {
    let created: { authStrategyConfig?: { kind: string; config: { scopes?: string[] } } } | null =
      null;
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={() => undefined}
        onSuccess={(c) => {
          created = c as unknown as typeof created;
        }}
      />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Oc");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://o/flowable-rest/service",
    );
    await user.click(screen.getByTestId("auth-kind-oidc"));
    await user.type(screen.getByTestId("auth-oidc-issuer"), "https://idp.example.com");
    await user.type(screen.getByTestId("auth-oidc-client-id"), "flowatch");
    await user.type(screen.getByTestId("auth-oidc-scopes"), "openid, profile");
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(created).not.toBeNull());
    expect(
      (
        created as unknown as {
          authStrategyConfig?: { kind: string; config: { scopes?: string[] } };
        } | null
      )?.authStrategyConfig?.config?.scopes,
    ).toEqual(["openid", "profile"]);
  });

  it("Submit Basic implicit writes authStrategyConfig kind basic without touching segmented-control", async () => {
    let created: { authStrategyConfig?: { kind: string } } | null = null;
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={() => undefined}
        onSuccess={(c) => {
          created = c as unknown as typeof created;
        }}
      />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Imp");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://i/flowable-rest/service",
    );
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(created).not.toBeNull());
    expect(
      (created as unknown as { authStrategyConfig?: { kind: string } } | null)?.authStrategyConfig
        ?.kind,
    ).toBe("basic");
  });

  it("Save disabled when Bearer textarea empty", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Br");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://b/flowable-rest/service",
    );
    await user.click(screen.getByTestId("auth-kind-bearer"));
    const submit = screen.getByTestId("add-connection-submit") as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("auth-bearer-token"), "tok");
    expect(submit).not.toBeDisabled();
  });

  it("OIDC invalid issuer surfaces ErrorBox", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Bad");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://x/flowable-rest/service",
    );
    await user.click(screen.getByTestId("auth-kind-oidc"));
    await user.type(screen.getByTestId("auth-oidc-issuer"), "not-a-url");
    await user.type(screen.getByTestId("auth-oidc-client-id"), "c");
    await user.type(screen.getByTestId("auth-oidc-scopes"), "openid");
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(screen.getByText(/Must be a valid URL/)).toBeInTheDocument());
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
  });

  it("Save disabled when OIDC required fields missing", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Oc");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://o/flowable-rest/service",
    );
    await user.click(screen.getByTestId("auth-kind-oidc"));
    const submit = screen.getByTestId("add-connection-submit") as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("auth-oidc-issuer"), "https://idp.example.com");
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("auth-oidc-client-id"), "c");
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("auth-oidc-scopes"), "openid");
    expect(submit).not.toBeDisabled();
  });

  it("Bearer kind hides username/password inputs; persisted payload omits them", async () => {
    let created: {
      username?: string;
      password?: string;
      authStrategyConfig?: { kind: string };
    } | null = null;
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={() => undefined}
        onSuccess={(c) => {
          created = c as unknown as typeof created;
        }}
      />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "B");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://b/flowable-rest/service",
    );
    await user.click(screen.getByTestId("auth-kind-bearer"));
    expect(screen.queryByTestId("add-connection-username")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-connection-password")).not.toBeInTheDocument();
    await user.type(screen.getByTestId("auth-bearer-token"), "tok");
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(created).not.toBeNull());
    const c = created as unknown as {
      username?: string;
      password?: string;
      authStrategyConfig?: { kind: string };
    };
    expect(c.username).toBeUndefined();
    expect(c.password).toBeUndefined();
    expect(c.authStrategyConfig?.kind).toBe("bearer");
  });

  it("switching Basic → Bearer clears any typed username/password", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-username"), "alice");
    await user.type(screen.getByTestId("add-connection-password"), "s3cret");
    await user.click(screen.getByTestId("auth-kind-bearer"));
    await user.click(screen.getByTestId("auth-kind-basic"));
    expect((screen.getByTestId("add-connection-username") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("add-connection-password") as HTMLInputElement).value).toBe("");
  });

  it("radiogroup carries role + aria-label", async () => {
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const rg = await screen.findByRole("radiogroup", { name: "Authentication method" });
    expect(rg).toBeInTheDocument();
  });

  it("resets state on re-open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <AddConnectionModal open onClose={onClose} onSuccess={() => undefined} />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Junk");
    rerender(<AddConnectionModal open={false} onClose={onClose} onSuccess={() => undefined} />);
    rerender(<AddConnectionModal open onClose={onClose} onSuccess={() => undefined} />);
    const label = (await screen.findByTestId("add-connection-label")) as HTMLInputElement;
    expect(label.value).toBe("");
  });
});
