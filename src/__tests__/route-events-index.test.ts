// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/events` route loader (Story 24.2 AC-4 / AC-8).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadEventSubscriptions } from "../routes/events/index";

describe("/events route loader", () => {
  const real = apiModule.api.listEventSubscriptions;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    (
      apiModule.api as unknown as {
        listEventSubscriptions: (p: unknown) => Promise<unknown>;
      }
    ).listEventSubscriptions = vi.fn((p: unknown) => {
      lastParams = p;
      return Promise.resolve({ data: [], total: 0, start: 0, size: 50 });
    });
  });

  afterEach(() => {
    (apiModule.api as unknown as { listEventSubscriptions: typeof real }).listEventSubscriptions =
      real;
  });

  it("calls api.listEventSubscriptions({ size: 50 }) for empty filters", async () => {
    await loadEventSubscriptions({});
    expect(lastParams).toEqual({ size: 50 });
  });

  it("forwards processInstanceId when set", async () => {
    await loadEventSubscriptions({ processInstanceId: "pi-1" });
    expect(lastParams).toEqual({ processInstanceId: "pi-1", size: 50 });
  });

  it("forwards eventType + eventName + tenantId composed filters", async () => {
    await loadEventSubscriptions({
      eventType: "message",
      eventName: "payment-confirmed",
      tenantId: "t-1",
    });
    expect(lastParams).toEqual({
      eventType: "message",
      eventName: "payment-confirmed",
      tenantId: "t-1",
      size: 50,
    });
  });
});
