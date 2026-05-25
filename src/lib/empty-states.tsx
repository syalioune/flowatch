// SPDX-License-Identifier: Apache-2.0

/**
 * Empty-state copy registry — bootstrap-and-extend.
 *
 * Story 9.1 BOOTSTRAPS this file with the single `deployments` entry. The
 * bootstrap-and-extend contract (Epic 8 retro §8 item 1 decision (b)) is:
 *
 *   - Each downstream list-screen story (9.4, 10.1, 11.1, 12.1, 13.1, 14.1,
 *     15.1, …) APPENDS its own entry to `emptyStates` in its own commit. The
 *     existing entries are NEVER mutated by a sibling story.
 *   - Story 17.5 may LATER canonicalise the registry — likely widening
 *     `EmptyStateEntry` with optional `icon`, `actions`, `layout`. That
 *     widening MUST stay back-compatible with the `title` + `body` fields
 *     so this story's entries (and every sibling story's entries) keep
 *     rendering without modification.
 *
 * The `EmptyState` component is the renderer; routes import the component
 * + look up the entry by key (`entry={emptyStates.deployments}`). This keeps
 * the copy in one place even though seven screens consume it.
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

export const emptyStates: Record<string, EmptyStateEntry> = {
  definitions: {
    title: "No process definitions yet.",
    body: "Upload a BPMN deployment to see process definitions here.",
  },
  deployments: {
    title: "No deployments yet.",
    body: "Upload a .bpmn file or use the BPMN modeler to deploy your first process.",
  },
  deploymentResources: {
    title: "No resources.",
    body: "This deployment has no files. That's unusual — deployments typically bundle at least one BPMN / DMN file.",
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
};

export interface EmptyStateProps {
  entry: EmptyStateEntry;
}

/**
 * Renders an empty-state block inside the page's existing `.empty` wrapper
 * (centered-mute styling from src/styles.css). `<a className="btn">` is used
 * for the CTA so it inherits the button styling without taking a dependency
 * on TanStack Router's <Link/> (entries may point at external docs).
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
