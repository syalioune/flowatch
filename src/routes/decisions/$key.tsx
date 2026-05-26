// SPDX-License-Identifier: Apache-2.0

/**
 * Per-decision detail route (Story 15.1).
 *
 * Fetches the latest version of a DMN decision by key via the DMN
 * repository search endpoint (`?key=...&latest=true`). The detail page is
 * a thin shell + property table + a placeholder "Test execute" button
 * that Story 15.3 swaps for the real `<ExecuteDecisionModal>` trigger.
 */

import { createFileRoute } from "@tanstack/react-router";
import { api, type FlowableDecision, type FlowablePage } from "../../api";
import { DecisionDetail } from "../../components/DecisionDetail";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/decisions/$key")({
  loader: ({ params }) =>
    api.listDecisions({ key: params.key, latest: true, size: 1 }) as Promise<
      FlowablePage<FlowableDecision>
    >,
  staticData: {
    title: "Decision detail",
    endpoints: [
      {
        method: "GET",
        path: "/dmn-repository/decisions?key={key}&latest=true",
        desc: "Find decision by key (latest version)",
      },
      {
        method: "GET",
        path: "/dmn-repository/decision-tables/{decisionId}/resourcedata",
        desc: "Fetch DMN XML (by decision-table id)",
      },
    ],
  },
  component: DecisionDetailRoute,
  pendingComponent: () => (
    <div className="empty" style={{ padding: 24 }}>
      Loading…
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
    </div>
  ),
});

function DecisionDetailRoute() {
  const page = Route.useLoaderData();
  const decision = page.data[0];
  if (!decision) {
    const entry = emptyStates.decisions;
    return <div className="page">{entry ? <EmptyState entry={entry} /> : null}</div>;
  }
  return <DecisionDetail decision={decision} />;
}
