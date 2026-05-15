import { createFileRoute } from "@tanstack/react-router";
import { api } from "../api";
import { ErrorBox } from "../lib/error-box";
import { openInspector } from "../lib/nav";
import { useApi } from "../lib/useApi";
import { Tenants } from "../screens";

export const Route = createFileRoute("/tenants")({
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
  return <Tenants tenants={list} onOpenInspector={openInspector} />;
}
