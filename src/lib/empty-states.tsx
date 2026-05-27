// SPDX-License-Identifier: Apache-2.0

/**
 * Empty-state copy registry — design-system citizen (UX §13).
 *
 * Story 9.1 bootstrapped this file with the single `deployments` entry.
 * Story 17.5 canonicalised the registry:
 *   - Added `ScreenKey` union as the type-checked source of truth for keys.
 *   - Replaced `Record<string, EmptyStateEntry>` with
 *     `satisfies Record<ScreenKey, EmptyStateEntry>` so adding a key without
 *     an entry (or an entry without a key) is a tsc-time compile error.
 *   - Added the `getEmptyState(key)` typed accessor — replaces the
 *     `as NonNullable<typeof emptyStates.X>` cast pattern that worked around
 *     `noUncheckedIndexedAccess: true` in tsconfig.app.json.
 *
 * Append discipline (preserved from bootstrap-and-extend, Epic 8 retro §8):
 *   - New screens add (a) a key to `ScreenKey` AND (b) the entry to
 *     `emptyStates`. `tsc` enforces both halves at compile time.
 *   - Existing entries are NEVER mutated by a sibling story (copy edits
 *     are explicit registry changes; the registry is the diff).
 *   - The `<EmptyState>` component's render shape (title + body + optional
 *     cta) is NOT widened by 17.5 — future widening (icon, actions, layout)
 *     remains a deliberate design decision; back-compat is the contract.
 *
 * The `<EmptyState>` component is the renderer; routes import it +
 * call `getEmptyState("X")` for the entry. This keeps the copy in one
 * place even though 18+ screens / panels consume it.
 *
 * Naming note: the epic AC names some keys in kebab-case
 * (identity-users, dmn-decisions); the shipped registry uses bare
 * camelCase. Story 17.5 keeps the shipped names — renaming would touch
 * every consumer for no operator value.
 */

import type React from "react";

export interface EmptyStateCTA {
  label: string;
  href: string;
}

export interface EmptyStateEntry {
  title: string;
  body: string;
  cta?: EmptyStateCTA;
}

export type ScreenKey =
  | "activeActivities"
  | "decisions"
  | "decisionResource"
  | "definitions"
  | "deployments"
  | "deploymentResources"
  | "dmnDeployments"
  | "dmnExecutions"
  | "groupMembers"
  | "groups"
  | "historicActivities"
  | "historicInstances"
  | "historicInstanceVariables"
  | "historicNoRecord"
  | "historicTasks"
  | "historicVariables"
  | "instances"
  | "instanceVariables"
  | "jobs"
  | "runtimeEnded"
  | "stacktrace"
  | "tasks"
  | "tenants"
  | "users";

export const emptyStates = {
  decisions: {
    title: "No DMN decisions yet.",
    body: "Deploy a .dmn file via the Deployments tab (Story 15.2) or use the DMN modeler at /dmn to author and deploy a decision table.",
  },
  decisionResource: {
    title: "No DMN resource found in deployment.",
    body: "The decision's parent deployment did not bundle a DMN file matching this decision's key. This is unusual — re-deploy the decision via the DMN modeler or the Deployments tab to recover the XML.",
  },
  definitions: {
    title: "No process definitions yet.",
    body: "Upload a BPMN deployment to see process definitions here.",
  },
  deployments: {
    title: "No deployments yet.",
    body: "Upload a .bpmn file or use the BPMN modeler to deploy your first process.",
  },
  groups: {
    title: "No groups yet.",
    body: "Groups appear here when the engine has identity records. The Flowable Modeler 'Identity' tab can seed users + groups; the IDM REST API also accepts POST /identity/groups.",
  },
  groupMembers: {
    title: "No members in this group.",
    body: "Add users to this group via the 'Add user' action (arrives in Story 14.3) or via POST /identity/users/{userId}/groups directly.",
  },
  activeActivities: {
    title: "No active activities right now.",
    body: "This instance is idle (awaiting a timer, a message, or a parallel branch to converge) — or all branches have completed.",
  },
  deploymentResources: {
    title: "No resources.",
    body: "This deployment has no files. That's unusual — deployments typically bundle at least one BPMN / DMN file.",
  },
  dmnDeployments: {
    title: "No DMN deployments yet.",
    body: "Upload a .dmn file via the 'Deploy DMN' button to push a decision table to the engine. DMN deployments are independent of BPMN deployments.",
  },
  dmnExecutions: {
    title: "No DMN executions yet.",
    body: "Decision executions appear here once you run a decision (Test execute from /decisions, or a process instance evaluates a Business Rule Task). The engine records each evaluation with inputs, outputs, hit policy, and timing.",
  },
  historicActivities: {
    title: "No recorded activities for this instance yet.",
    body: "Activities appear here as the engine records them. If the instance has just started, give it a moment and refresh.",
  },
  historicInstances: {
    title: "No completed instances yet.",
    body: "Once a process instance ends — by completion, cancellation, or admin delete — it appears here as a historic record.",
  },
  historicInstanceVariables: {
    title: "No historic variables for this instance.",
    body: "Variables appear here once the engine archives them — typically after the instance ends. Running instances may show fewer variables than their runtime counterpart until the engine flushes.",
  },
  historicNoRecord: {
    title: "No historic record yet.",
    body: "The instance is still running — see the runtime section above. A historic record appears when the engine archives the instance lifecycle.",
  },
  historicTasks: {
    title: "No historic tasks yet.",
    body: "Completed tasks across all instances appear here. Try waiting for a workflow to be claimed and completed.",
  },
  historicVariables: {
    title: "No historic variables yet.",
    body: "Variables appear here once a process instance ends and the engine archives its variable history.",
  },
  instances: {
    title: "No running process instances.",
    body: "Start an instance from a process definition to see it listed here.",
  },
  instanceVariables: {
    title: "No variables.",
    body: "This instance is not carrying any global or local variables yet.",
  },
  jobs: {
    title: "No jobs on this tab.",
    body: "Try switching to Timers or Dead-letter, or trigger a workflow that schedules background work.",
  },
  runtimeEnded: {
    title: "This instance has ended.",
    body: "See the historic record below for completion details.",
  },
  stacktrace: {
    title: "No stacktrace available.",
    body: "The engine has no recorded exception for this job. It may have succeeded after retries, or never raised.",
  },
  tasks: {
    title: "No tasks for this filter.",
    body: "Try switching the filter, or wait for a workflow to assign one.",
  },
  tenants: {
    title: "No tenant-scoped resources found.",
    body: "Tenants are derived from deployment tenantIds (flowable-rest 7.2 has no /identity/tenants endpoint). Deploy a process with a `tenantId` to populate this view.",
  },
  users: {
    title: "No users yet.",
    body: "Users appear here when the engine has identity records. The Flowable Modeler 'Identity' tab can seed users + groups; the IDM REST API also accepts POST /identity/users.",
  },
} satisfies Record<ScreenKey, EmptyStateEntry>;

/**
 * Typed accessor for the empty-state registry. The `satisfies` declaration
 * above guarantees every ScreenKey has an entry, so the non-null assertion
 * inside is sound — it cannot fail at runtime unless the registry is mutated
 * (which the const-export shape forbids).
 *
 * Consumers that previously wrote
 *
 *   <EmptyState entry={emptyStates.X as NonNullable<typeof emptyStates.X>} />
 *
 * MAY migrate to
 *
 *   <EmptyState entry={getEmptyState("X")} />
 *
 * to drop the cast. Either shape compiles; the helper is the operator-cheaper
 * path for new code.
 */
export function getEmptyState(key: ScreenKey): EmptyStateEntry {
  // biome-ignore lint/style/noNonNullAssertion: satisfies clause above guarantees presence
  return emptyStates[key]!;
}

export interface EmptyStateProps {
  entry: EmptyStateEntry;
}

/**
 * Renders an empty-state block inside the page's existing `.empty` wrapper
 * (centered-mute styling from src/styles/components.css). `<a className="btn">`
 * is used for the CTA so it inherits the button styling without taking a
 * dependency on TanStack Router's <Link/> (entries may point at external docs).
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ entry }) => (
  <div className="empty" data-testid="empty-state">
    <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
      {entry.title}
    </h3>
    <p style={{ margin: 0 }}>{entry.body}</p>
    {entry.cta && (
      <p style={{ marginTop: 12 }}>
        <a className="btn" href={entry.cta.href} data-size="sm">
          {entry.cta.label}
        </a>
      </p>
    )}
  </div>
);
