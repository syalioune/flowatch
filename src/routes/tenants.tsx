// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { api } from "../api";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";
import { Tenants } from "../screens";

export const Route = createFileRoute("/tenants")({
  staticData: {
    title: "Tenants",
    endpoints: [
      {
        method: "GET",
        path: "/repository/deployments?size=1000",
        desc: "Distinct tenantIds (no /identity/tenants in 7.2)",
      },
    ],
  },
  component: TenantsRoute,
});

function TenantsRoute() {
  const tenants = useApi(() => api.listTenants(), []);
  if (tenants.loading) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 24 }}>
          Loading…
        </div>
      </div>
    );
  }
  if (tenants.error) {
    return (
      <div className="page">
        <ErrorBox error={tenants.error} onRetry={tenants.reload} />
      </div>
    );
  }
  const list = (tenants.data?.data ?? []).filter((t) => t.id);
  return <Tenants tenants={list} />;
}
