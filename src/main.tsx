// SPDX-License-Identifier: Apache-2.0

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { resolveOidcProviderConfig } from "./lib/oidc-accessor";
// Self-hosted IBM Plex faces must register before any layout-affecting CSS.
import "./styles/fonts.css";
import "./lib/route-meta";
import { routeTree } from "./routeTree.gen";
import "./styles/index.css";

// bpmn-js assets
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

// dmn-js assets.
// `*-controls.css` bundles are load-bearing for the in-cell editing
// popovers (input expression, type selector, predefined values, hit
// policy). Without them, the popovers render unstyled and get clipped /
// hidden by our app chrome.
import "dmn-js/dist/assets/diagram-js.css";
import "dmn-js/dist/assets/dmn-js-shared.css";
import "dmn-js/dist/assets/dmn-js-drd.css";
import "dmn-js/dist/assets/dmn-js-decision-table.css";
import "dmn-js/dist/assets/dmn-js-decision-table-controls.css";
import "dmn-js/dist/assets/dmn-js-literal-expression.css";
import "dmn-js/dist/assets/dmn-js-boxed-expression.css";
import "dmn-js/dist/assets/dmn-js-boxed-expression-controls.css";
import "dmn-js/dist/assets/dmn-font/css/dmn-embedded.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element not found");

// Story 28.4 (ADR-009): when the active connection is OIDC, dynamically import
// the react-oidc-context provider (its own `oidc` Vite chunk) and wrap the app
// in <AuthProvider>. For Basic/Bearer users the chunk never loads — the
// tree-shake intent. The dynamic import is the lazy boundary.
const tree = <RouterProvider router={router} />;
const oidcCfg = resolveOidcProviderConfig();
if (oidcCfg) {
  import("./lib/oidc-provider").then(({ renderWithOidc }) => {
    renderWithOidc(rootEl, tree, oidcCfg);
  });
} else {
  ReactDOM.createRoot(rootEl).render(tree);
}
