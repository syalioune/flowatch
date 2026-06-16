// SPDX-License-Identifier: Apache-2.0

/**
 * Historic-process-instance wrappers — extracted from src/api.ts for NFR-21
 * navigability (50 KB per-source-file limit). Pattern P-001 preserved: all
 * calls funnel through the exported `request<T>` in src/api.ts.
 *
 * Surface:
 *   - GET /history/historic-process-instances (list + per-id)
 *   - GET /history/historic-activity-instances (list)
 *   - GET /history/historic-variable-instances (list)
 *   - GET /history/historic-task-instances (list)
 *
 * Re-exported on the central `api` object in src/api.ts so callers continue
 * to import from `../api`.
 */

import { request } from "./api";
import type {
  FlowableHistoricActivity,
  FlowableHistoricProcessInstance,
  FlowableHistoricTask,
  FlowableHistoricVariable,
  FlowablePage,
  QueryParams,
} from "./api-types";

export const listHistoricInstances = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricProcessInstance>>(
    "GET",
    "/history/historic-process-instances",
    { params },
  );

// Story 13.1: per-id GET for the historic detail panel — the runtime sibling
// is api.getProcessInstance. Returns the same DTO as items in the list
// response (Flowable's historic surface re-uses the shape).
export const getHistoricProcessInstance = (id: string) =>
  request<FlowableHistoricProcessInstance>("GET", `/history/historic-process-instances/${id}`);

export const listHistoricActivities = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricActivity>>("GET", "/history/historic-activity-instances", {
    params,
  });

export const listHistoricVariables = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricVariable>>("GET", "/history/historic-variable-instances", {
    params,
  });

export const listHistoricTasks = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricTask>>("GET", "/history/historic-task-instances", {
    params,
  });
