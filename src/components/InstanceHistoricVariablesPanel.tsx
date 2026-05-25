// SPDX-License-Identifier: Apache-2.0

/**
 * Per-instance historic variables panel — seventh panel-as-sibling
 * consumer after 10.4 / 11.3 / 12.4 / 13.1-runtime / 13.1-historic /
 * 13.2-activities. Project decision (Epic 12 retro R-2): never extract.
 * The pattern's value IS the conformance.
 *
 * Mirrors how `<InstanceVariablesPanel>` is nested inside
 * `<InstanceRuntimePanel>` for the runtime side. Mounted inside
 * `<InstanceHistoricPanel>` after the properties table so the operator
 * sees the archived variable values alongside the historic record on
 * the same `/instances/$id` detail page (in addition to the flat
 * `/history?type=variables` tab).
 *
 * Per RC-12, the historic-variables endpoint nests the variable payload
 * under `entry.variable.{name, type, value, scope}` — the panel reads
 * from there. Same render strategy as `<InstanceVariablesPanel>`:
 * `prettyJson` for object values, quoted-string for strings, raw String()
 * for primitives.
 *
 * Status-aware error-probe (Epic 11 retro §4.4) applies defensively:
 * 404 → null → empty state. In practice the engine returns
 * `{data: []}` not 404 for a no-archive-yet instance.
 */

import { api, FlowableError, type FlowableHistoricVariable } from "../api";
import { Icon } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";
import { prettyJson, typeTone, VALUE_RENDER_BUDGET } from "./InstanceVariablesPanel";

const HISTORIC_VAR_PAGE_SIZE = 200;

export const fetchHistoricVariablesOrNull = async (
  instanceId: string,
): Promise<FlowableHistoricVariable[] | null> => {
  try {
    const page = await api.listHistoricVariables({
      processInstanceId: instanceId,
      size: HISTORIC_VAR_PAGE_SIZE,
    });
    return page.data ?? [];
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

const truncatePrimitive = (raw: string): string => {
  if (raw.length <= VALUE_RENDER_BUDGET) return raw;
  const more = raw.length - VALUE_RENDER_BUDGET;
  return `${raw.slice(0, VALUE_RENDER_BUDGET)}… (truncated; ${more} more chars)`;
};

const renderHistoricVarValue = (value: unknown, type?: string): JSX.Element => {
  if (value === null) return <span className="mute">null</span>;
  if (value === undefined) return <span className="mute">—</span>;
  if (type === "json" || (typeof value === "object" && value !== null)) {
    return (
      <pre
        className="mono"
        style={{ margin: 0, fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
        title="Full value omitted; copy via the Inspector"
      >
        {prettyJson(value)}
      </pre>
    );
  }
  if (type === "string") {
    return (
      <span className="mono" style={{ fontSize: 11.5 }}>
        "{truncatePrimitive(String(value))}"
      </span>
    );
  }
  return (
    <span className="mono" style={{ fontSize: 11.5 }}>
      {truncatePrimitive(String(value))}
    </span>
  );
};

interface Props {
  instanceId: string;
}

export function InstanceHistoricVariablesPanel({ instanceId }: Props) {
  const variables = useApi<FlowableHistoricVariable[] | null>(
    () => fetchHistoricVariablesOrNull(instanceId),
    [instanceId],
  );
  const list = variables.data ?? [];

  return (
    <div
      className="panel"
      data-testid="instance-historic-variables-panel"
      style={{ marginTop: 18 }}
    >
      <div className="panel-hd">
        <span className="panel-title">Historic variables</span>
        {variables.data && list.length > 0 && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            {list.length}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /history/historic-variable-instances?processInstanceId={instanceId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="historic-variables-refresh"
          onClick={variables.reload}
          disabled={variables.loading}
          aria-label="Refresh historic variables"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {variables.loading && <TableSkeleton columns={4} rows={3} />}
        {variables.error && <ErrorBox error={variables.error} onRetry={variables.reload} />}
        {!variables.loading && !variables.error && list.length === 0 && (
          <EmptyState
            entry={
              emptyStates.historicInstanceVariables as NonNullable<
                typeof emptyStates.historicInstanceVariables
              >
            }
          />
        )}
        {!variables.loading && !variables.error && list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Scope</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {list.map((entry) => {
                const inner = entry.variable;
                return (
                  <tr key={entry.id} data-historic-variable-id={entry.id}>
                    <td>
                      <span className="mono">{inner?.name ?? <span className="mute">—</span>}</span>
                    </td>
                    <td>
                      <span className="badge" data-tone={typeTone(inner?.type)}>
                        {inner?.type ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className="badge" data-tone="mute">
                        {inner?.scope ?? "global"}
                      </span>
                    </td>
                    <td>{renderHistoricVarValue(inner?.value, inner?.type)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
