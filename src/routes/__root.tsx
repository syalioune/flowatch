// SPDX-License-Identifier: Apache-2.0

import { createRootRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import App from "../app";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : () => null;

function RootLayout() {
  return (
    <>
      <App />
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-right" />
        </Suspense>
      )}
    </>
  );
}

export const Route = createRootRoute({ component: RootLayout });
