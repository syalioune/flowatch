// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/jobs` route loader (Story 12.1 AC-1).
 *
 * Mirrors the 9.1 / 9.4 / 10.1 / 11.1 precedent: the loader is the smallest
 * piece of route-bound logic worth pinning; the four-state UI is exercised by
 * the E2E suite (e2e/jobs-list.spec.ts). 12.1's wrinkle is that the three
 * branches call THREE DIFFERENT endpoints (not three parameter variants of
 * one), so each branch needs its own spy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadJobs } from "../routes/jobs/index";

describe("/jobs route loader", () => {
  const realListJobs = apiModule.api.listJobs;
  const realListTimerJobs = apiModule.api.listTimerJobs;
  const realListDeadLetterJobs = apiModule.api.listDeadLetterJobs;
  let lastJobsParams: unknown = null;
  let lastTimerParams: unknown = null;
  let lastDeadLetterParams: unknown = null;

  beforeEach(() => {
    lastJobsParams = null;
    lastTimerParams = null;
    lastDeadLetterParams = null;
    (apiModule.api as unknown as { listJobs: (p: unknown) => Promise<unknown> }).listJobs = vi.fn(
      (p: unknown) => {
        lastJobsParams = p;
        return Promise.resolve({ data: [], total: 0, start: 0, size: 50 });
      },
    );
    (
      apiModule.api as unknown as { listTimerJobs: (p: unknown) => Promise<unknown> }
    ).listTimerJobs = vi.fn((p: unknown) => {
      lastTimerParams = p;
      return Promise.resolve({ data: [], total: 0, start: 0, size: 50 });
    });
    (
      apiModule.api as unknown as { listDeadLetterJobs: (p: unknown) => Promise<unknown> }
    ).listDeadLetterJobs = vi.fn((p: unknown) => {
      lastDeadLetterParams = p;
      return Promise.resolve({ data: [], total: 0, start: 0, size: 50 });
    });
  });

  afterEach(() => {
    (apiModule.api as unknown as { listJobs: typeof realListJobs }).listJobs = realListJobs;
    (apiModule.api as unknown as { listTimerJobs: typeof realListTimerJobs }).listTimerJobs =
      realListTimerJobs;
    (
      apiModule.api as unknown as { listDeadLetterJobs: typeof realListDeadLetterJobs }
    ).listDeadLetterJobs = realListDeadLetterJobs;
  });

  it("AC-1 executable: calls listJobs with size=50 and withException=true", async () => {
    await loadJobs("executable");
    expect(lastJobsParams).toEqual({ size: 50, withException: true });
    expect(lastTimerParams).toBeNull();
    expect(lastDeadLetterParams).toBeNull();
  });

  it("AC-1 timer: calls listTimerJobs with size=50 only", async () => {
    await loadJobs("timer");
    expect(lastTimerParams).toEqual({ size: 50 });
    expect(lastJobsParams).toBeNull();
    expect(lastDeadLetterParams).toBeNull();
  });

  it("AC-1 deadletter: calls listDeadLetterJobs with size=50 only", async () => {
    await loadJobs("deadletter");
    expect(lastDeadLetterParams).toEqual({ size: 50 });
    expect(lastJobsParams).toBeNull();
    expect(lastTimerParams).toBeNull();
  });
});
