// **Which kinds are registered** — the one line that turns the sweep on (ADR-0198 §2).
//
// Its own module rather than a constant inside `notification-kind.ts`, for a reason that is
// mechanical before it is aesthetic: a kind reads `DEDUP` and `NOTIFY_PREF` from that file
// while it is being evaluated, so a registry there would import its own implementers and be
// imported back by them — a cycle that in CommonJS hands one side an `undefined` from a
// half-initialised module. Keeping the interface ignorant of its implementers also lets the
// sweep's spec mock this file alone, which is a two-line module with nothing else in it.
import type { NotificationKind } from './notification-kind';
import { taskAssignedKind } from './kinds/task-assigned.kind';
import { taskDigestKind } from './kinds/task-digest.kind';
import { taskDueKind } from './kinds/task-due.kind';

/** ADR-0198's phase A. Phases B, C and D append here and nothing else changes — which was
 *  phase 3's claim, made while this array was empty. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  taskDueKind,
  taskDigestKind,
  taskAssignedKind,
];
