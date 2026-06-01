// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/batches` route loader (Story 24.1 AC-3).
 *
 * Canonical-archetype loader-unit per Epic 11 retro A-4 Option b — browser-
 * tier route-mount tests are deferred; Vitest pins the loader's wire shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadBatches } from "../routes/batches/index";

describe("/batches route loader", () => {
  const real = apiModule.api.listBatches;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    (apiModule.api as unknown as { listBatches: (p: unknown) => Promise<unknown> }).listBatches =
      vi.fn((p: unknown) => {
        lastParams = p;
        return Promise.resolve({ data: [], total: 0, start: 0, size: 50 });
      });
  });

  afterEach(() => {
    (apiModule.api as unknown as { listBatches: typeof real }).listBatches = real;
  });

  it("calls api.listBatches({ size: 50 })", async () => {
    await loadBatches();
    expect(lastParams).toEqual({ size: 50 });
  });

  it("returns the page as-is", async () => {
    const out = await loadBatches();
    expect(out).toMatchObject({ data: [], total: 0 });
  });
});
