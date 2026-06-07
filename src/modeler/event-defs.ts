// SPDX-License-Identifier: Apache-2.0

/**
 * Story 30.1 — event-definition editing (signal / message / timer / error).
 *
 * Events (start / intermediate / boundary / end) carry a single
 * `eventDefinitions[0]`. Signal/Message/Error reference a ROOT element
 * (bpmn:Signal/Message/Error under <definitions>) the operator edits by name
 * (errorCode for errors); Timer stores an inline FormalExpression
 * (timeDate/timeDuration/timeCycle). These are STANDARD BPMN (not flowable:),
 * but authoring them is the operator-feel ask.
 *
 * The logic is pure + free of bpmn-js so it is testable headless: the
 * `<BpmnModeler>` component passes a service object backed by bpmn-js
 * modeling; the unit test passes a fake service + a real bpmn-moddle so the
 * round-trip is asserted without mounting the modeler.
 */

import { randomId } from "../lib/random-id";

// biome-ignore lint/suspicious/noExplicitAny: moddle BO graph is dynamic (ADR-001)
export type AnyEl = any;

export interface EventDefSvc {
  moddle: { create: (type: string, attrs?: Record<string, unknown>) => AnyEl };
  /** Command-stack-backed property write on an arbitrary moddle element. */
  updateModdle: (target: AnyEl, props: Record<string, unknown>) => void;
  /** The <definitions> moddle element (root-element host) — null in transient
      mount states; ref creation no-ops gracefully when absent. */
  definitions: AnyEl | null;
}

export const TIMER_KINDS = ["timeDuration", "timeDate", "timeCycle"] as const;
export type TimerKind = (typeof TIMER_KINDS)[number];

export const firstEventDef = (bo: AnyEl): AnyEl | null => bo?.eventDefinitions?.[0] ?? null;

/** Classify an event definition into the operator-facing kind, or null. */
export const eventDefKind = (ed: AnyEl | null): "signal" | "message" | "error" | "timer" | null => {
  if (!ed) return null;
  const t = String(ed.$type || "");
  if (t.endsWith("SignalEventDefinition")) return "signal";
  if (t.endsWith("MessageEventDefinition")) return "message";
  if (t.endsWith("ErrorEventDefinition")) return "error";
  if (t.endsWith("TimerEventDefinition")) return "timer";
  return null;
};

/** Resolve the referenced root element (Signal/Message/Error), creating +
    registering it under <definitions> when absent. */
export const ensureEventRef = (
  svc: EventDefSvc,
  ed: AnyEl,
  refProp: string,
  rootType: string,
): AnyEl | null => {
  if (ed[refProp]) return ed[refProp];
  const prefix = rootType.split(":")[1] || "Ref";
  const ref = svc.moddle.create(rootType, { id: `${prefix}_${randomId(8)}` });
  if (svc.definitions) {
    ref.$parent = svc.definitions;
    svc.updateModdle(svc.definitions, {
      rootElements: [...(svc.definitions.rootElements || []), ref],
    });
  }
  svc.updateModdle(ed, { [refProp]: ref });
  return ref;
};

/** Edit a referenced root element's attribute (Signal.name / Message.name /
    Error.errorCode / Error.name). Empty clears the attr. */
export const setEventRefAttr = (
  svc: EventDefSvc,
  ed: AnyEl,
  refProp: string,
  rootType: string,
  attr: string,
  value: string,
): void => {
  const ref = ensureEventRef(svc, ed, refProp, rootType);
  if (!ref) return;
  svc.updateModdle(ref, { [attr]: value === "" ? undefined : value });
};

export const timerKindOf = (ed: AnyEl): TimerKind =>
  TIMER_KINDS.find((k) => ed[k] != null) ?? "timeDuration";
export const timerValueOf = (ed: AnyEl): string => {
  const v = ed[timerKindOf(ed)];
  return v?.body == null ? "" : String(v.body);
};

/** Set the timer's single FormalExpression under the chosen kind, clearing the
    other two (a timer carries exactly one of date/duration/cycle). Empty value
    clears the timer expression entirely. */
export const setTimerDef = (svc: EventDefSvc, ed: AnyEl, kind: TimerKind, body: string): void => {
  const props: Record<string, unknown> = {
    timeDuration: undefined,
    timeDate: undefined,
    timeCycle: undefined,
  };
  const trimmed = body.trim();
  if (trimmed) {
    const expr = svc.moddle.create("bpmn:FormalExpression", { body: trimmed });
    expr.$parent = ed;
    props[kind] = expr;
  }
  svc.updateModdle(ed, props);
};
