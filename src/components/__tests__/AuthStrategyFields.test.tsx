// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for the Story 28.2 <AuthStrategyFields> extraction.
 *
 * Controlled/presentational — a small stateful harness wires kind + field
 * values so the segmented-control + per-kind toggle + dormancy note can be
 * exercised the way the modals/tab drive it.
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthStrategyKind } from "../../lib/auth-strategy-config";
import { AuthStrategyFields } from "../AuthStrategyFields";

afterEach(() => cleanup());

function Harness({ initialKind = "basic" as AuthStrategyKind }) {
  const [kind, setKind] = React.useState<AuthStrategyKind>(initialKind);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [bearerToken, setBearerToken] = React.useState("");
  const [oidcIssuer, setOidcIssuer] = React.useState("");
  const [oidcClientId, setOidcClientId] = React.useState("");
  const [oidcScopes, setOidcScopes] = React.useState("");
  const switchKind = (next: AuthStrategyKind) => {
    setBearerToken("");
    setOidcIssuer("");
    setOidcClientId("");
    setOidcScopes("");
    setUsername("");
    setPassword("");
    setKind(next);
  };
  return (
    <AuthStrategyFields
      idPrefix="harness"
      kind={kind}
      onKindChange={switchKind}
      username={username}
      onUsernameChange={setUsername}
      password={password}
      onPasswordChange={setPassword}
      bearerToken={bearerToken}
      onBearerTokenChange={setBearerToken}
      oidcIssuer={oidcIssuer}
      onOidcIssuerChange={setOidcIssuer}
      oidcClientId={oidcClientId}
      onOidcClientIdChange={setOidcClientId}
      oidcScopes={oidcScopes}
      onOidcScopesChange={setOidcScopes}
    />
  );
}

describe("<AuthStrategyFields>", () => {
  it("renders three segments inside a radiogroup with aria-pressed", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Authentication method" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-kind-basic")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("auth-kind-bearer")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("auth-kind-oidc")).toHaveAttribute("aria-pressed", "false");
  });

  it("Basic selected: username/password inputs present, no bearer/oidc fields", () => {
    render(<Harness />);
    expect(screen.getByTestId("harness-username")).toBeInTheDocument();
    expect(screen.getByTestId("harness-password")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-bearer-token")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-oidc-issuer")).not.toBeInTheDocument();
  });

  it("Basic selected shows NO dormancy note (Basic is live in 28.2)", () => {
    render(<Harness />);
    expect(screen.queryByTestId("auth-dormancy-note")).not.toBeInTheDocument();
  });

  it("Bearer selected: textarea + help + dormancy note appear, basic fields gone", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("auth-kind-bearer"));
    expect(await screen.findByTestId("auth-bearer-token")).toBeInTheDocument();
    expect(screen.getByTestId("auth-bearer-help")).toBeInTheDocument();
    expect(screen.getByTestId("auth-dormancy-note")).toBeInTheDocument();
    expect(screen.queryByTestId("harness-username")).not.toBeInTheDocument();
  });

  it("OIDC selected: issuer/clientId/scopes + dormancy note appear", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId("auth-kind-oidc"));
    expect(await screen.findByTestId("auth-oidc-issuer")).toBeInTheDocument();
    expect(screen.getByTestId("auth-oidc-client-id")).toBeInTheDocument();
    expect(screen.getByTestId("auth-oidc-scopes")).toBeInTheDocument();
    expect(screen.getByTestId("auth-dormancy-note")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-bearer-token")).not.toBeInTheDocument();
  });

  it("switching kind clears the previous kind's exclusive field", async () => {
    const user = userEvent.setup();
    render(<Harness initialKind="bearer" />);
    const token = await screen.findByTestId("auth-bearer-token");
    await user.type(token, "tok-xyz");
    expect((token as HTMLTextAreaElement).value).toBe("tok-xyz");
    await user.click(screen.getByTestId("auth-kind-oidc"));
    await user.click(screen.getByTestId("auth-kind-bearer"));
    expect(((await screen.findByTestId("auth-bearer-token")) as HTMLTextAreaElement).value).toBe(
      "",
    );
  });
});
