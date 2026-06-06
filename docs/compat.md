---
testedVersion: "7.2.0"
testedImage: "flowable/flowable-rest:7.2.0"
auditDate: "2026-05-11"
---

# Flowable REST API Compatibility Matrix

**Engine under test:** `flowable/flowable-rest:7.2.0` (the image specified in [docker-compose.yml](../docker-compose.yml)).
**Audit date:** 2026-05-11
**Method:** live HTTP probes against a running engine + selective endpoint mutation tests (mutations were reverted).

This document tracks which PRD functional requirements are **viable on flowable-rest 7.x OSS as shipped** vs. which need an alternate path (different OSS distribution, scope reduction, or v2+ deferral).

> ⚠️ **`flowable-rest` is one of several Flowable distributions.** `flowable-task`, `flowable-modeler`, `flowable-admin`, and `flowable-ui` ship additional sub-apps and may expose endpoints the bare REST distribution does not. This audit reflects only the `flowable-rest:7.2.0` Docker image — which is what Flowatch's `docker-compose.yml` boots and what the PRD targets.

---

## Sub-app coverage in `flowable-rest:7.2.0`

Each Flowable engine module exposes a separate REST root URL. From this image:

| Sub-app | Root URL | Status | Used by |
|---|---|---|---|
| Process / runtime / identity / management / history / form (subset) | `/flowable-rest/service` | ✅ mounted | Most Flowatch screens |
| DMN | `/flowable-rest/dmn-api` | ✅ mounted | DMN modeler, decisions, history |
| CMMN | `/flowable-rest/cmmn-api` | ✅ mounted (verified live data) | Not yet used by Flowatch; FR-50 candidate |
| App | `/flowable-rest/app-api` | 🟡 partially mounted — `app-repository/app-definitions` works (read-only browse shipped Story 25.1); `app-runtime/app-instances` returns "No endpoint" | FR-55 partial |
| Form (standalone API) | `/flowable-rest/form-api` | ❌ **not mounted** (404 on the whole prefix) | Blocks FR-51 against this image |
| Content service | `/flowable-rest/content-service` | ❌ **not mounted** ("No endpoint") | Blocks FR-52 against this image |

**Implication:** Task forms (`/form/form-data` under `/service`) and task-level attachments (`/runtime/tasks/{id}/attachments`) work fine in this image. Standalone form definitions, content items, and instance-level comments do not. See FR-by-FR table below for the consequences.

---

## Verified endpoints (per PRD FR)

✅ = works · 🟡 = partial · ❌ = endpoint missing in this image · ⏳ = not yet probed · 🚫 = client-side only

### v1 MVP — already covered (recap of existing FRs)

| FR | Endpoint | Status | Notes |
|----|----------|--------|-------|
| FR-1 | `GET /management/engine` (probe) | ✅ | Returns `{name, version: "7.2.0"}` |
| FR-10..14 | `/repository/deployments`, `/repository/process-definitions` | ✅ | All standard CRUD verified |
| FR-15..18 | `/runtime/process-instances` + `/variables` | ✅ | List, start, cancel, vars read |
| FR-20..21 | `/runtime/tasks` + action POST | ✅ | claim/complete/delegate/resolve/unclaim |
| FR-22 | `/form/form-data` | ✅ | Task forms render+submit work |
| FR-24..27 | `/management/jobs`, `/management/timer-jobs`, `/management/deadletter-jobs`, exception-stacktrace | ✅ | |
| FR-28 | `/history/historic-*` | ✅ | |
| FR-30..31 | `/identity/users`, `/identity/groups`, `listTenants` synth from `/repository/deployments` | ✅ | |
| FR-32..34 | `/dmn-api/dmn-repository/*`, `/dmn-api/dmn-rule/execute` | ✅ | DMN sub-app live |

### v1.x — newly added by the 6.x parity audit

| FR | Endpoint(s) | Status | Notes / impact |
|----|------------|--------|----------------|
| **FR-19** Variable edit on instances | `PUT /runtime/process-instances/{id}/variables` with body `[{name,value,type,scope}]` | ✅ | Verified — returned `201 Created` on a probe write (reverted). Body shape is an array of variable descriptors. |
| **FR-29** Process diagram token overlay | Client-side composition of `getProcessDefinitionResource` (XML) + `/history/historic-activity-instances` | ✅ | All required endpoints work — feature is client-side rendering only. |
| **FR-43** Process definition category edit | `PUT /repository/process-definitions/{id}` with body `{"category":"..."}` | ✅ | Verified by actually changing a def's category and reverting. Same endpoint handles `suspend`/`activate` actions. |
| **FR-44** Task edit (priority, due date, owner, …) | `PUT /runtime/tasks/{id}` with task properties in body | ✅ | Verified the endpoint accepts PUT. Full property list per Flowable REST docs: name, description, priority, dueDate, owner, assignee, category, parentTaskId, tenantId. |
| **FR-45** Task attachments | `/runtime/tasks/{id}/attachments` | ✅ | Endpoint verified live (200). Supports GET (list), POST (add), DELETE per Flowable REST spec. |
| **FR-46** User lifecycle | `POST /identity/users`, `PUT /identity/users/{id}`, `DELETE /identity/users/{id}` | ✅ | POST with empty body returns `Bad request: Id cannot be null` — endpoint present and validating. |
| **FR-47** Group lifecycle | `POST /identity/groups`, `PUT /identity/groups/{id}`, `DELETE /identity/groups/{id}` | ✅ | Same pattern as users. |
| **FR-48** Privilege management | `/identity/privileges` (and 3 alternate paths probed) | ❌ | All four path variants returned `"No endpoint GET /flowable-rest/service/identity/..."`. **flowable-rest:7.2.0 does not expose privileges.** FR-48 is **blocked at the REST layer** — either drop the FR or switch the deployment image to one that mounts the IDM admin endpoints. Likely candidates: `flowable-idm` (standalone IDM app) or `flowable-ui` (bundles IDM). |
| **FR-49** Multi-connection (saved engines) | Client-side only | 🚫 | No engine-side requirement. Flowatch-only feature; FR fully feasible. |
| **FR-50** CMMN parallel surface | `/cmmn-api/cmmn-repository/*`, `/cmmn-api/cmmn-runtime/*`, `/cmmn-api/cmmn-management/*` | ✅ | **CMMN is fully exposed.** Live probe returned a real CMMN task ("Provide new sales lead"). FR-50 is technically feasible in v1.x if scope allows — the REST surface is there. |
| **FR-51** Forms as first-class artifacts | `/form-api/form-repository/*` | ❌ | Whole prefix `/flowable-rest/form-api/` returns 404 in this image. **Form definitions and deployments cannot be managed via REST in `flowable-rest:7.2.0`.** Workarounds: (a) switch to `flowable-ui` image which bundles the form sub-app, or (b) use the existing task-level `/form/form-data` for runtime, accepting that form designer output must be deployed by some other path (bpmn-deployment with form embedded, or out-of-band). |
| **FR-52** Content engine integration | `/content-service/content-items` | ❌ | Returns "No endpoint". Content engine not bundled in `flowable-rest:7.2.0`. **Task-level attachments (FR-45) still work** — they're a separate, simpler mechanism. Recommend dropping the content-service-engine integration aspect of FR-52 and keeping just FR-45 attachments. |
| **FR-53** Batches | `/management/batches` | ✅ | Endpoint returns 200 with paginated data (empty in this engine state). Per Flowable docs: `/management/batches/{id}` and `/management/batches/{id}/batch-parts` are available too. Shipped Story 24.1 — list / detail / per-part stacktrace via `<BatchPartsPanel>` row-expand. |
| **FR-54** Event subscriptions | `/runtime/event-subscriptions` | ✅ | Endpoint returns 200. List works; filtering by `processInstanceId`, `eventType`, `eventName`, `tenantId` per Flowable REST spec. Shipped Story 24.2 — standalone `/events` route + `<InstanceEventSubscriptionsPanel>` mounted inside `<InstanceRuntimePanel>`. |
| **FR-55** App definitions / `.bar` recognition | `/app-api/app-repository/app-definitions` (list) ✅; `/app-api/app-runtime/app-instances` ❌ | 🟡 | **Partial — browse side shipped Story 25.1** (`/app-definitions` route + `<DeploymentAppDefinitionsPanel>` + `<DeploymentBundledProcessesPanel>` + .bar upload modal recognition). App-instances (runtime side) is not exposed in this image. The BPMN and App sub-apps DO NOT cross-register a `.bar` deployment — see RC-17 in [runtime-caveats.md](runtime-caveats.md). |
| **FR-57** DMN decision-execution history | `/dmn-api/dmn-history/historic-decision-executions` | ✅ | Endpoint returns 200 with paginated data. Probes: filter by `decisionKey`, `instanceId`, `processInstanceId` per Flowable DMN REST spec. |
| **FR-59** Model versioning in modeler | Client-side (modeler-only feature) | 🚫 | No engine-side requirement beyond existing deployment + definition versioning (already covered by FR-14, definitions show `version` field). FR fully feasible. |

### v2+ — deferred regardless

| FR | Endpoint(s) | Status | Notes |
|----|------------|--------|-------|
| **FR-56** Instance migration | `/process-migration`, `/process-instance-migration` | ❌ | Both return "No endpoint". **Migration is not exposed in flowable-rest 7.2.0 OSS.** Available in Flowable Enterprise per [docs.flowable.com](https://documentation.flowable.com/). Defer FR-56 to v2+ as already planned, with the caveat that **it may never be feasible** in pure OSS REST. |
| **FR-58** DMN decision services / DRDs | `/dmn-api/dmn-repository/decision-services` | ❌ | Returns "No endpoint". Defer FR-58 to v2+ as already planned; `dmn-js` supports DRD modeling client-side but deployment via REST is blocked. |

### Other relevant findings (not tied to a specific FR)

| Endpoint | Status | Note |
|---|---|---|
| `/runtime/tasks/{id}/comments` | ✅ | Task-level comments work. Could feed a future "add comment to task" UI. |
| `/runtime/process-instances/{id}/comments` | ❌ | "No endpoint". Process-instance-level comments not exposed. |
| `/history/historic-task-instances/{id}/comments` | ❌ | Historical comments not exposed. |
| `/runtime/tasks/{id}/identitylinks` | ✅ | Allows querying / adding / removing candidate users and groups on a task. Useful for FR-44 (task edit). |
| `/repository/process-definitions/{id}/identitylinks` | ✅ | Same for definition-level identity links (who can start a process). |

---

## Headline impact on the PRD

### Affirmed (build as planned)

FR-19, FR-29, FR-43, FR-44, FR-45, FR-46, FR-47, FR-49, FR-50, FR-53, FR-54, FR-57, FR-59 — **all viable** against `flowable-rest:7.2.0` as shipped. FR-50 (CMMN) being available is the biggest positive surprise — the engine is there if Flowatch ever wants to build the surface.

### Blocked or scope-reduced

| FR | Original intent | Adjusted reality |
|----|-----------------|------------------|
| **FR-48 privileges** | Surface privilege management | ❌ Blocked. Recommend **removing from v1.x and re-scoping as v2+ "if user demand surfaces"**, requires switching deployment image. |
| **FR-51 forms as artifact** | Standalone form definitions + deployments | ❌ Blocked in this image. **Recommend reducing to "in-task form rendering via `/form/form-data`"** (already FR-22) **+ form-js designer for *modeling* only** (FR-23). Standalone form REST gets re-evaluated if we add `flowable-ui` as an alternate deployment target. |
| **FR-52 content engine integration** | Full content engine support | ❌ Blocked in this image. **Reduce to task-level attachments only** via FR-45. The content engine integration aspect of FR-52 can be removed. |
| **FR-55 app definitions** | Full app-definition lifecycle | 🟡 Read-only app-definition browsing + `.bar` upload recognition is feasible. App-runtime (instantiating apps) is not. **Reduce FR-55 to "recognize and browse" — drop "run as app-instance".** |
| **FR-56 migration** | Process/case instance migration | ❌ Already v2+; this audit confirms the deferral is permanent under pure OSS REST. |
| **FR-58 DMN decision services / DRD** | DMN with multiple wired decisions | ❌ Already v2+; deployment via REST is blocked. Client-side modeling possible via `dmn-js` but no deploy path. |

### Recommended PRD revisions

1. **FR-48 privileges:** mark as **v2+ deferred-and-blocked**. Document the alternate-image workaround. Avoid building UI plumbing that can't be tested against `flowable-rest:7.2.0`.
2. **FR-51 forms as artifact:** rewrite to "in-task form rendering + form-js designer for authoring; no standalone form-definition deployment path until/unless Flowatch supports the `flowable-ui` / `flowable-form` images."
3. **FR-52 content engine:** drop the engine-side aspect; keep FR-45 task-level attachments as the only attachment story.
4. **FR-55 app definitions:** trim to "browse + `.bar` upload recognition" — explicitly out-of-scope is app-instance management.
5. **FR-58 DMN decision services:** keep as v2+ but note the OSS REST limitation in the description.

These changes don't reduce the v1.x roadmap meaningfully — they bring it in line with what the OSS REST contract actually exposes.

---

## Re-test triggers

This audit MUST be re-run when any of these change:

- Flowable releases a new minor version (`7.3`, `7.4`, …). New endpoints may appear; existing ones may change shape.
- Flowatch switches its reference Docker image (e.g. adopts `flowable-ui` or `flowable-task`).
- Flowatch adopts a new FR that depends on a Flowable endpoint not in this table.

CI should run a slim smoke test against the production-target Flowable image on every push (per FR-F4 / NFR-12) to detect regressions in the endpoints listed above.

---

## Raw probe output

The probe script that produced these findings:

```bash
BASE="http://localhost:8080/flowable-rest/service"
AUTH="-u rest-admin:test"
probe() { curl -sf -m 5 $AUTH -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo "ERR"; }

# ... (full script preserved in commit history when this audit re-runs)
```

Verified mutating probes that were rolled back:
- `PUT /repository/process-definitions/{id}` with `{"category":"audit-probe"}` → revert with `{"category":""}`.
- `PUT /runtime/process-instances/{id}/variables` with `[{"name":"probe","value":"x","type":"string","scope":"local"}]` → revert with `DELETE /variables/probe`.

No persistent state in the engine was changed by this audit.
