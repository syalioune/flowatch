// SPDX-License-Identifier: Apache-2.0

/**
 * Identity-surface wrappers — extracted from src/api.ts for NFR-21
 * navigability (50 KB per-source-file limit). Pattern P-001 preserved: all
 * calls funnel through the exported `request<T>` in src/api.ts.
 *
 * Surface:
 *   - GET   list/get + membership reads (Stories 14.1 / 14.2)
 *   - POST  /identity/groups/{groupId}/members + symmetric DELETE (Story 14.3)
 *   - POST  /identity/users + /identity/groups (Stories 22.1 / 22.3)
 *   - PUT   /identity/users/{id} + /identity/groups/{id} (Stories 22.2 / 22.3)
 *   - DELETE /identity/users/{id} + /identity/groups/{id} (Stories 22.2 / 22.3)
 *
 * Re-exported on the central `api` object in src/api.ts so callers continue
 * to import from `../api`.
 */

import { request } from "./api";
import type { FlowableGroup, FlowablePage, FlowableUser, QueryParams } from "./api-types";

export const listUsers = (params?: QueryParams) =>
  request<FlowablePage<FlowableUser>>("GET", "/identity/users", { params });

export const getUser = (id: string) => request<FlowableUser>("GET", `/identity/users/${id}`);

export const listGroups = (params?: QueryParams) =>
  request<FlowablePage<FlowableGroup>>("GET", "/identity/groups", { params });

export const getGroup = (id: string) => request<FlowableGroup>("GET", `/identity/groups/${id}`);

// flowable-rest 7.2 OSS does NOT serve GET /identity/users/{userId}/groups —
// the working recipe is GET /identity/groups?member={userId}, symmetric to
// listGroupMembers's ?memberOfGroup={groupId} workaround below.
export const getUserGroups = (userId: string) =>
  request<FlowablePage<FlowableGroup>>("GET", "/identity/groups", {
    params: { member: userId },
  });

// flowable-rest 7.2 does not expose GET /identity/groups/{id}/members. The
// supported recipe is GET /identity/users?memberOfGroup={id}, which returns
// the FlowablePage<FlowableUser> in the group.
export const listGroupMembers = (groupId: string, params?: QueryParams) =>
  request<FlowablePage<FlowableUser>>("GET", "/identity/users", {
    params: { ...(params ?? {}), memberOfGroup: groupId },
  });

// Flowable 7.2 OSS exposes the group-centric membership-write endpoint:
// POST /identity/groups/{groupId}/members with body {userId}. The inverse
// user-centric route (POST /identity/users/{userId}/groups {groupId}) is
// not honoured against a live engine — confirmed via Bruno during 14.3
// post-closure verification.
export const addUserToGroup = (userId: string, groupId: string) =>
  request<void>("POST", `/identity/groups/${groupId}/members`, { body: { userId } });

// Symmetric pair to addUserToGroup. Flowable 7.2 OSS does NOT honour the
// inverse user-centric DELETE /identity/users/{userId}/groups/{groupId}
// path — the engine returns HTTP 500 "No endpoint DELETE ...". The working
// recipe is DELETE /identity/groups/{groupId}/members/{userId}. Returns 204
// on success; 404 if the membership doesn't exist; 403 if the caller lacks
// permission.
export const removeUserFromGroup = (userId: string, groupId: string) =>
  request<void>("DELETE", `/identity/groups/${groupId}/members/${userId}`);

/**
 * Story 22.1: create an identity user.
 *
 * Funnels `POST /identity/users` through `request()` with a full-object body.
 * The engine validates `id` non-null (empty body returns
 * `Bad request: Id cannot be null` per docs/compat.md FR-46 line 63); the
 * wrapper does NOT pre-validate — the modal layer disables Save when id is
 * empty (`<CreateUserModal>` AC-2). `tenantId` is read-only on
 * `FlowableUser` and is OMITTED from the create body (a deferred-work entry
 * tracks the live-engine acceptance for a future widening).
 *
 * Anchors the POST-create wrapper family at N=1; Story 22.3 `createGroup`
 * becomes N=2.
 *
 * Engine response: `201 Created` with echoed `FlowableUser` (password omitted
 * from echo per Flowable security default). Duplicate-id returns 4xx with
 * verbatim engine message. Verified live on flowable-rest 7.2.0.
 */
export const createUser = (body: {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}) => request<FlowableUser>("POST", "/identity/users", { body });

/**
 * Story 22.2: edit fields on an identity user (firstName / lastName / email /
 * password).
 *
 * Funnels `PUT /identity/users/{id}` through `request()` with a partial-fields
 * body. Third consumer of the PUT-with-partial-fields wrapper family — see
 * CLAUDE.md "PUT-with-partial-fields wrapper family (Epic 22 retro N=4
 * codification)".
 *
 * `id` is immutable (engine ignores `id` in body per T-10 Probe 5); the
 * wrapper does NOT accept `id` in `fields`. Password is sent as the same
 * shape (no special endpoint); the engine omits password from the 200-OK
 * echo by default. `encodeURIComponent(id)` is non-negotiable.
 *
 * Engine response: `200 OK` with the echoed `FlowableUser`. Throws if
 * `fields` is empty.
 */
export const updateUser = (
  id: string,
  fields: Partial<{ firstName: string; lastName: string; email: string; password: string }>,
) => {
  if (Object.keys(fields).length === 0) throw new Error("updateUser requires at least one field");
  return request<FlowableUser>("PUT", `/identity/users/${encodeURIComponent(id)}`, {
    body: fields,
  });
};

/**
 * Story 22.2: hard-delete an identity user.
 *
 * Funnels `DELETE /identity/users/{id}` through `request()`. Anchors the
 * DELETE-by-id wrapper family at N=1.
 *
 * `encodeURIComponent(id)` is non-negotiable. Engine response: `204 No
 * Content` on success; `404` with verbatim message on a non-existent id
 * (idempotent retry returns the same shape — T-10 Probe 9).
 *
 * Flowable 7.2 OSS orphans foreign-key references (tasks, instances) rather
 * than cascade-deleting. Verified live on flowable-rest 7.2.0.
 */
export const deleteUser = (id: string) =>
  request<void>("DELETE", `/identity/users/${encodeURIComponent(id)}`);

/**
 * Story 22.3: create an identity group.
 *
 * Funnels `POST /identity/groups` through `request()`. Second consumer of the
 * POST-create wrapper family. The engine validates `id` non-null per FR-47.
 * `type` is a free string at the wire level — no enum enforced; common
 * values are `security` and `assignment`. Verified live on flowable-rest
 * 7.2.0.
 *
 * Engine response: `201 Created` with echoed `FlowableGroup`. Duplicate-id
 * returns 4xx with verbatim engine message.
 */
export const createGroup = (body: { id: string; name?: string; type?: string }) =>
  request<FlowableGroup>("POST", "/identity/groups", { body });

/**
 * Story 22.3: edit fields on an identity group (name / type).
 *
 * Funnels `PUT /identity/groups/{id}` through `request()` with a partial-
 * fields body. **Fourth consumer of the PUT-with-partial-fields wrapper
 * family** — codification trigger; see CLAUDE.md "PUT-with-partial-fields
 * wrapper family (Epic 22 retro N=4 codification)".
 *
 * `id` is immutable; `type` is typically `security` or `assignment` but is a
 * free string at the wire level. `encodeURIComponent(id)` non-negotiable.
 *
 * Engine response: `200 OK` with echoed `FlowableGroup`. Throws synchronously
 * if `fields` is empty.
 */
export const updateGroup = (id: string, fields: Partial<{ name: string; type: string }>) => {
  if (Object.keys(fields).length === 0) throw new Error("updateGroup requires at least one field");
  return request<FlowableGroup>("PUT", `/identity/groups/${encodeURIComponent(id)}`, {
    body: fields,
  });
};

/**
 * Story 22.3: hard-delete an identity group.
 *
 * Funnels `DELETE /identity/groups/{id}` through `request()`. Second consumer
 * of the DELETE-by-id wrapper family.
 *
 * `encodeURIComponent(id)` non-negotiable. Engine response: `204 No Content`;
 * `404` on a non-existent id. Cascade behaviour: Flowable cascade-deletes
 * the group-membership join rows server-side (verified T-12 Probe 7) — the
 * modal surfaces no cascade checkbox.
 */
export const deleteGroup = (id: string) =>
  request<void>("DELETE", `/identity/groups/${encodeURIComponent(id)}`);
