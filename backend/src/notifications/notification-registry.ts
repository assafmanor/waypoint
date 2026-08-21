// **Which kinds are registered** — the one line that turns the sweep on (ADR-0198 §2).
//
// Its own module rather than a constant inside `notification-kind.ts`, for a reason that is
// mechanical before it is aesthetic: a kind reads `DEDUP` and `NOTIFY_PREF` from that file
// while it is being evaluated, so a registry there would import its own implementers and be
// imported back by them — a cycle that in CommonJS hands one side an `undefined` from a
// half-initialised module. Keeping the interface ignorant of its implementers also lets the
// sweep's spec mock this file alone, which is a two-line module with nothing else in it.
import type { NotificationKind } from './notification-kind';
import type { DeliveryOptions } from './notification-sender';
import { eventSoonKind } from './kinds/event-soon.kind';
import { readinessNudgeKind } from './kinds/readiness-nudge.kind';
import { spanEdgeKind } from './kinds/span-edge.kind';
import { taskAssignedKind } from './kinds/task-assigned.kind';
import { taskDigestKind } from './kinds/task-digest.kind';
import { taskDueKind } from './kinds/task-due.kind';
import { tripTomorrowKind } from './kinds/trip-tomorrow.kind';

/** ADR-0198's phases A, B and C. Phase D appends here and nothing else changes — which was
 *  phase 3's claim, made while this array was empty, and it has now survived three phases. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  taskDueKind,
  taskDigestKind,
  taskAssignedKind,
  eventSoonKind,
  spanEdgeKind,
  tripTomorrowKind,
  readinessNudgeKind,
];

/**
 * **The transport policy for a kind, by id** — `timeCritical` becomes RFC 8030's `Urgency`
 * and `staleAfterMs` becomes the `TTL`.
 *
 * Derived rather than declared a second time: both facts are already on the kind, and a
 * per-kind table of urgencies would be a copy that could disagree with the flag the sweep
 * enforces. Looked up by id because the dispatcher holds a `DueSend`, which carries the id
 * and not the object.
 *
 * An unknown id (the dev-only `test` send) gets the conservative pair: ordinary urgency and a
 * short life, because a message nobody can name should not outlive the moment it was sent.
 */
export function deliveryFor(kindId: string): DeliveryOptions {
  const kind = NOTIFICATION_KINDS.find((candidate) => candidate.id === kindId);
  if (!kind) return { urgency: 'normal', ttlSeconds: UNKNOWN_KIND_TTL_SECONDS };
  return {
    urgency: kind.timeCritical ? 'high' : 'normal',
    // Rounded UP: a TTL a second shorter than the staleness window could expire a send the
    // sweep would still have considered current.
    ttlSeconds: Math.ceil(kind.staleAfterMs / 1000),
  };
}

/** Fifteen minutes. Long enough for a test send to survive a locked phone, short enough that
 *  it cannot arrive tomorrow. */
const UNKNOWN_KIND_TTL_SECONDS = 15 * 60;
