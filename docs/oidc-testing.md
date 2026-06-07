# Testing the OIDC auth strategy with Keycloak (Story 28.4)

The default `make stack` Flowable engine is **Basic-only** — it cannot validate
an IdP's JWTs (ADR-009: "Flowatch cannot solve the engine side"). To exercise
the OIDC AuthStrategy end-to-end you need a real OpenID Provider. This repo
ships a throwaway Keycloak fixture that auto-provisions a realm, a public PKCE
client, and two test users.

> ⚠️ Throwaway dev fixture. Never deploy it — the credentials are intentionally
> weak and public, and `keycloak/**` is GitGuardian-allowlisted as test-only.

## Start it

```bash
make keycloak-up      # docker compose -f docker-compose.keycloak.yml up -d
```

| | |
|---|---|
| Admin console | http://localhost:8081/ (`admin` / `admin`) |
| Issuer (OIDC) | `http://localhost:8081/realms/flowatch` |
| Client ID | `flowatch` (public, PKCE S256, no client secret) |
| Redirect URI | `http://localhost:5173/*` (the Vite dev origin) |
| Test users | `mira` / `mira-test` · `alice` / `alice-test` |

First boot imports `keycloak/flowatch-realm.json` (~20-30 s). Wait for health:

```bash
make keycloak-ps      # STATUS should show (healthy)
curl -s http://localhost:8081/realms/flowatch/.well-known/openid-configuration | head -c 200
```

## Point Flowatch at it

Run the app (`make dev`, http://localhost:5173) → **Settings → Authentication →
OIDC**:

| Field | Value |
|---|---|
| Issuer URL | `http://localhost:8081/realms/flowatch` |
| Client ID | `flowatch` |
| Scopes | `openid, profile, email, offline_access` |

Save → the app reloads to mount `<AuthProvider>` (RC-18: provider config is
render-time) → click **Sign in with your identity provider** → Keycloak login →
sign in as `mira` → redirected back; the Auth tab shows **Signed in as mira**.

## What you can verify

- **Header swap** — open the API Inspector; `api.*` calls now carry
  `Authorization: Bearer ***` (was `Basic ***`). The Flowable engine **401s**
  because it wants Basic — *expected*; the header swap is what's proven here.
- **PKCE** — the redirect to Keycloak's `/authorize` carries a `code_challenge`.
- **In-memory tokens (NFR-11)** — DevTools → Application → Local/Session Storage:
  **no** access/refresh token is stored. Only the `{issuer, clientId, scopes}`
  config lives in `flowatch.connections.v1`.
- **Silent renew** — `offline_access` + `automaticSilentRenew` renew the token
  without a redirect (access-token lifespan is 300 s in this realm).
- **Sign out** — the `oidc-sign-out` button calls `signoutRedirect()` →
  Keycloak session revoked → subsequent calls send no Authorization header.

## Stop it

```bash
make keycloak-down    # remove the container (realm is re-imported on next up)
```

The fixture has no persistent volume — every `keycloak-up` re-imports a clean
realm.
