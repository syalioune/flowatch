# SPDX-License-Identifier: Apache-2.0
#
# Flowatch SPA — production Docker image.
#
# Two stages: a Node.js builder runs the Vite production build, then a tiny
# nginx:alpine runtime serves the resulting dist/ as static assets with
# correct cache-control headers for the hashed-asset bundle.
#
# The runtime image carries zero application JavaScript outside of the
# built bundle — no Node, no JRE, no Flowable. The operator points the SPA
# at any reachable Flowable backend via Settings (persisted to localStorage
# by the running app — there is no server-side config to mount).
#
# Base images are digest-pinned per NFR-26 (no floating tags). Dependabot's
# `docker` ecosystem (.github/dependabot.yml) bumps these weekly; the
# trailing `# <tag>` comment is load-bearing for Dependabot's PR diff
# rendering — preserve it on every digest change.

# ---------------------------------------------------------------------------
# Stage 1: builder
# ---------------------------------------------------------------------------
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS builder
# node:22-alpine — Vite build + npm ci. Matches .nvmrc (Node 22 LTS)
# which the rest of the toolchain (semantic-release 25, biome, vitest,
# playwright) requires; node:20-alpine would skew the image's Node
# version against everything else and risks subtle build-vs-runtime
# behaviour drift.

WORKDIR /build

# Copy dependency manifests first so `npm ci` is cached on dep-unchanged
# rebuilds. The build context is filtered by .dockerignore — node_modules,
# dist, .git, e2e artifacts, planning docs, etc. are all excluded.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --prefer-offline

# Now the source tree. The build reads .nvmrc, tsconfig.json, vite.config.ts,
# src/, public/, index.html, and the vite-config-time `__BUILD_SHA__` /
# `__FLOWABLE_TESTED_VERSION__` / `__APP_VERSION__` defines.
COPY . .

# Build args let CI inject the canonical SHA + version so the runtime image
# carries the same values the rest of CI uses. Local builds without
# --build-arg fall back to `vite.config.ts`'s `getBuildSha()` (`git
# rev-parse --short HEAD` → `"dev"` if `.git` is excluded by .dockerignore).
ARG BUILD_SHA=""
ARG APP_VERSION="0.0.0"
ENV BUILD_SHA=$BUILD_SHA
ENV APP_VERSION=$APP_VERSION

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine@sha256:4c18337659c90a01627f2e152b7c89524521c82dcedb255dc83d3689642b0803
# nginxinc/nginx-unprivileged:alpine — static SPA serving as non-root.
#
# The upstream nginx team maintains this variant specifically for non-root
# operation. Differences from nginx:alpine:
#   - Default USER is `nginx` (uid 101, gid 101) — set in the base image.
#   - Listens on 8080 by default (an unprivileged port; bind doesn't need
#     CAP_NET_BIND_SERVICE). Our SPA vhost in
#     docker/nginx-spa.conf.template explicitly sets `listen 8080`.
#   - PID file is /tmp/nginx.pid (writable by uid 101); /var/cache/nginx,
#     /var/run, /etc/nginx/conf.d are all owned by uid 101 in the base.
#
# Why non-root: defense-in-depth against container escapes + compliance
# with most Kubernetes PodSecurity baseline / restricted policies, which
# reject pods that allow runAsNonRoot=false. Operators can also drop
# all Linux capabilities without breaking anything.

# OCI image labels — `org.opencontainers.image.{source,licenses,title,
# description}` are required by the spec ACs; `revision` and `version` are
# injected by docker/metadata-action in CI but defaulted here for local
# `docker build` runs to avoid empty-label warnings.
ARG BUILD_SHA="dev"
ARG APP_VERSION="0.0.0"

LABEL org.opencontainers.image.source="https://github.com/syalioune/flowatch" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="Flowatch" \
      org.opencontainers.image.description="Modern Flowable 7 REST GUI — BPMN/DMN modeler + runtime operations" \
      org.opencontainers.image.documentation="https://github.com/syalioune/flowatch/blob/main/README.md" \
      org.opencontainers.image.revision="$BUILD_SHA" \
      org.opencontainers.image.version="$APP_VERSION"

# Replace the default nginx vhost with the SPA template. The unprivileged
# base inherits nginx:alpine's entrypoint, which renders any
# `/etc/nginx/templates/*.template` via envsubst at container start, then
# execs nginx. We don't currently use any env vars in the SPA template, but
# using the templates dir keeps consistency with the proxy template in
# docker-compose and leaves room for runtime config later.
#
# These COPY/RUN steps must happen BEFORE the base image drops privileges
# in its final CMD — Dockerfile build runs as root regardless of the base
# image's USER directive, so we don't need to chown anything explicitly.
# `rm -f` so a future digest that ships without default.conf doesn't break
# the build.
USER root

# Pull every security fix Alpine has published for the packages in this
# base image since the digest pin was set. The digest is locked per
# NFR-26 for supply-chain provenance, but that means curl / libcurl /
# openssl etc. fall behind upstream's CVE backports until Dependabot
# bumps the pin (weekly). Without this `apk -U upgrade`, Trivy fails the
# CI scan on every newly-disclosed Alpine SecDB CVE in those packages —
# even when an `:r` patch is already available in the Alpine repo.
# `--no-cache` keeps the layer slim (no apk index left behind).
RUN apk -U upgrade --no-cache

RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx-spa.conf.template /etc/nginx/templates/default.conf.template

# Copy the built SPA. dist/ is regenerated per build; the layer ordering
# above ensures changing only src/ doesn't invalidate the npm install layer.
# --chown=nginx:nginx ensures the runtime user can read the bundle (the
# default uid 101 is mapped to user `nginx` in the base image).
COPY --from=builder --chown=nginx:nginx /build/dist /usr/share/nginx/html

# Drop back to the unprivileged user the base image declares. nginx will
# bind to 8080 (matching the listen directive in the SPA template) and
# write its pid file to /tmp/nginx.pid (the default for this base).
USER nginx
EXPOSE 8080
