// SPDX-License-Identifier: Apache-2.0

/**
 * App definition detail route (Story 25.1). Mirrors the BPMN
 * /deployments/$id shape but reads from the App sub-app:
 *   - GET /app-api/app-repository/app-definitions/{id} → metadata
 *   - GET /app-api/app-repository/deployments/{deploymentId}/resources
 *     → list bundled .app / .bpmn20.xml / .dmn files (no separate runtime
 *     registration is needed; the AppDeployer already cascaded into the
 *     BPMN and DMN sub-apps at upload time — see RC-17).
 *
 * Resources have a `type` discriminator: "appDefinition" for the .app
 * manifest, "resource" for every other bundled file.
 */

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { api, type FlowableAppDefinition, type FlowableResource } from "../../api";
import { fmtTime, Icon, PageHead, toast } from "../../components";
import { ErrorBox } from "../../lib/error-box";

interface LoaderData {
  appDef: FlowableAppDefinition;
  resources: FlowableResource[];
  resourcesError: string | null;
}

const loadAppDefinitionDetail = async (id: string): Promise<LoaderData> => {
  const appDef = await api.getAppDefinition(id);
  let resources: FlowableResource[] = [];
  let resourcesError: string | null = null;
  if (appDef.deploymentId) {
    try {
      resources = await api.listAppDeploymentResources(appDef.deploymentId);
    } catch (err) {
      resourcesError = err instanceof Error ? err.message : String(err);
    }
  }
  return { appDef, resources, resourcesError };
};

export const Route = createFileRoute("/app-definitions/$id")({
  loader: ({ params }) => loadAppDefinitionDetail(params.id),
  staticData: {
    title: "App definition detail",
    endpoints: [
      {
        method: "GET",
        path: "/app-repository/app-definitions/{id}",
        desc: "Get app definition (appBase)",
      },
      {
        method: "GET",
        path: "/app-repository/deployments/{deploymentId}/resources",
        desc: "List bundled resources for the app-deployment (appBase)",
      },
      {
        method: "GET",
        path: "/app-repository/deployments/{deploymentId}/resourcedata/{name}",
        desc: "Download a bundled resource (appBase)",
      },
    ],
  },
  component: AppDefinitionDetailRoute,
  pendingComponent: () => (
    <div className="page">
      <div className="empty" style={{ padding: 24 }}>
        Loading…
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/app-definitions" className="btn">
          Back to app definitions
        </Link>
      </div>
    </div>
  ),
});

function AppDefinitionDetailRoute() {
  const { appDef, resources, resourcesError } = Route.useLoaderData();
  const router = useRouter();

  const handleDownload = async (resource: FlowableResource) => {
    if (!appDef.deploymentId) return;
    let url: string | null = null;
    try {
      const res = await api.getAppDeploymentResource(appDef.deploymentId, resource.id);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resource.id;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast({
        kind: "err",
        text: "Download failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="page">
      <PageHead
        title={appDef.name || appDef.id}
        subtitle={`App definition · v${appDef.version ?? "?"} · ${fmtTime(appDef.deploymentTime)}`}
        actions={
          <>
            <Link to="/app-definitions" className="btn" data-variant="ghost">
              <Icon name="chevron" size={12} />
              Back
            </Link>
            <button type="button" className="btn" onClick={() => router.invalidate()}>
              <Icon name="refresh" size={13} />
              Refresh
            </button>
          </>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Properties</span>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  Name
                </td>
                <td>{appDef.name || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Key</td>
                <td className="mono">{appDef.key || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Version</td>
                <td className="mono">
                  {appDef.version !== undefined ? `v${appDef.version}` : "—"}
                </td>
              </tr>
              <tr>
                <td className="mute">Description</td>
                <td>{appDef.description || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">App deployment ID</td>
                <td className="mono">{appDef.deploymentId || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Tenant</td>
                <td className="mono">{appDef.tenantId || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Deployed</td>
                <td className="mono">{fmtTime(appDef.deploymentTime)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Bundled resources</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /app-repository/deployments/{appDef.deploymentId}/resources
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {resourcesError && <ErrorBox error={new Error(resourcesError)} />}
          {!resourcesError && resources.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              No resources in this app deployment.
            </div>
          )}
          {!resourcesError && resources.length > 0 && (
            <table className="tbl" data-testid="app-deployment-resources-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Media type</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => {
                  const wide = r as FlowableResource & { type?: string };
                  return (
                    <tr key={r.id} data-testid={`app-resource-row-${r.id}`}>
                      <td className="mono">{r.id}</td>
                      <td>
                        <span
                          className="badge"
                          data-tone={wide.type === "appDefinition" ? "ok" : "neutral"}
                        >
                          <span className="sr-only">Resource type: </span>
                          {wide.type ?? "resource"}
                        </span>
                      </td>
                      <td className="mono mute">{r.mediaType}</td>
                      <td>
                        <button
                          type="button"
                          className="btn"
                          data-size="sm"
                          data-testid="download-app-resource"
                          onClick={() => handleDownload(r)}
                        >
                          <Icon name="download" size={11} />
                          Download
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
