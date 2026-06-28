// SPDX-License-Identifier: Apache-2.0

/**
 * App-sub-app wrappers — extracted from src/api.ts for NFR-21
 * navigability (50 KB per-source-file limit). Pattern P-001 preserved: all
 * calls funnel through the exported `request<T>` in src/api.ts.
 *
 * Surface (Story 25.1, FR-55 scope-reduced):
 *   - GET /app-repository/app-definitions (list + per-id)
 *   - GET /app-repository/deployments (list)
 *   - GET /app-repository/deployments/{id}/resources (list resources)
 *   - GET /app-repository/deployments/{id}/resourcedata/{name} (binary download)
 *
 * The write path (`deployBar`) stays in src/api.ts because it uses the
 * multipartFetch / uploadDeployment machinery that is module-internal there.
 *
 * Re-exported on the central `api` object in src/api.ts so callers continue
 * to import from `../api`.
 */

import { appBase, request } from "./api";
import type {
  FlowableAppDefinition,
  FlowableDeployment,
  FlowablePage,
  FlowableResource,
  QueryParams,
} from "./api-types";

// Story 25.1: FR-55 scope-reduced — repository side only. The /app-runtime
// half (app-instances) is unmounted in flowable-rest:7.2.0 (compat.md row 28).
export const listAppDefinitions = (params?: QueryParams) =>
  request<FlowablePage<FlowableAppDefinition>>("GET", "/app-repository/app-definitions", {
    params,
    base: appBase(),
  });

// Story 25.1: list App-sub-app deployments.
export const listAppDeployments = (params?: QueryParams) =>
  request<FlowablePage<FlowableDeployment>>("GET", "/app-repository/deployments", {
    params,
    base: appBase(),
  });

// Story 25.1: get a single app-definition by id — backs the
// /app-definitions/$id detail route.
export const getAppDefinition = (id: string) =>
  request<FlowableAppDefinition>("GET", `/app-repository/app-definitions/${id}`, {
    base: appBase(),
  });

// Story 25.1: list resources bundled in an app-deployment. Returns an array
// of { id, mediaType, type, url, contentUrl } where `type` is either
// "appDefinition" (for the .app manifest) or "resource" (everything else).
export const listAppDeploymentResources = (deploymentId: string) =>
  request<FlowableResource[]>("GET", `/app-repository/deployments/${deploymentId}/resources`, {
    base: appBase(),
  });

// Story 25.1: binary content fetch for an app-deployment resource. Returns
// the raw Response so callers pick .blob() / .text().
export const getAppDeploymentResource = (deploymentId: string, resourceName: string) =>
  request<Response>(
    "GET",
    `/app-repository/deployments/${deploymentId}/resourcedata/${encodeURIComponent(resourceName)}`,
    { asResponse: true, base: appBase() },
  );
