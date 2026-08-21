// The push wire contract: what the server encrypts and what the service worker draws
// (ADR-0197 §6). Shared so the two ends cannot drift, and **deliberately zod-free**.
//
// That exemption is the one thing worth reading before editing this file. Every other
// shape in this package validates through zod (ADR-0023), and this one cannot: the
// service worker is bundled separately with `inlineDynamicImports`, so a zod import here
// would inline zod and every schema beside it into the worker — on the critical path of
// every install. So this module imports **nothing**, exactly like `server-routes.ts`, and
// `parsePushPayload` is a hand-written narrow read.
//
// Which is what the worker needs regardless. A `push` handler must always show a
// notification (browsers penalise and eventually revoke permission for one that shows
// nothing), so it can never throw on a malformed payload — it needs a parse that answers
// `null` and lets the caller fall back, not one that raises.

/** The kinds a payload can carry — ADR-0198's catalogue, one member per row of it. Named
 *  constants rather than bare strings (ADR-0095), so a typo is a compile error at both ends
 *  of the wire instead of a notification nobody can route. Phases B, C and D add theirs
 *  here and nothing else in this file changes. */
export const NOTIFICATION_KIND = {
  /** The dev-only proof that the pipe works end to end. Never sent by the sweep. */
  TEST: 'test',
  /** **Phase A** (ADR-0198 §2). A task deadline with an HOUR on it, at that hour. A
   *  dated-no-time task never fires this — "Thursday" is not a moment — and is the
   *  digest's job instead. */
  TASK_DUE: 'task.due',
  /** The 08:00 local roll-up of what is open and dated today or tomorrow. The mechanism
   *  that makes a dated-no-time deadline reachable at all, which is most of what anyone
   *  writes weeks out. */
  TASK_DIGEST: 'task.digest',
  /** The catalogue's one social send, and it earns its place by being ADDRESSED: somebody
   *  put your name on something. */
  TASK_ASSIGNED: 'task.assigned',
  /** **Phase B** (ADR-0198 §2) — the trip's own commitments, and the first `timeCritical`
   *  rows in the catalogue. A hard event at `startsAt` minus its category's lead: the reason
   *  quiet hours can be broken at all, because a 05:30 departure has to ring at 03:30. */
  EVENT_HARD_SOON: 'event.hard.soon',
  /** An ambient span's own EDGE — a check-in, a check-out, a pick-up, a return (ADR-0164).
   *  Aims at the closing window bound where ADR-0184 gives one, because a check-in that
   *  reads 17:00-21:00 is a deadline at 21:00 and not an appointment at 17:00. */
  SPAN_EDGE_SOON: 'span.edge.soon',
  /** 19:00 the evening before day 1. The one row in the catalogue that fires before the trip
   *  has anything timed in it. */
  TRIP_TOMORROW: 'trip.tomorrow',
  /** **Phase C** (ADR-0198 §2) — 10:00 local at T-14 / T-7 / T-2, and only when one of
   *  ADR-0190's five readiness checks is still open. Three milestones rather than a daily
   *  countdown, and each names what is still MISSING: a nudge that repeats every day about
   *  a thing nobody has done yet is a nag with a calendar. */
  READINESS_NUDGE: 'readiness.nudge',
} as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[keyof typeof NOTIFICATION_KIND];

/**
 * What a notification says, and where tapping it goes.
 *
 * **No entity snapshot, ever.** The body is what a lock screen may show, so it names the
 * kind of obligation and its subject and nothing else — never document content, never a
 * confirmation code, never anything ADR-0015 encrypts. And the worker does not fetch on
 * `push`: it draws what it was handed, because a fetch there races a network the device
 * may not have.
 */
export interface PushPayload {
  kind: NotificationKind;
  /** The kind of obligation, e.g. `משימה להיום`. */
  title: string;
  /** Its subject, e.g. `צילום דרכונים · עד 18:00`. */
  body: string;
  /** An in-app path (`/trips/…`) the notification opens. Same-origin and absolute-path
   *  only — `notificationclick` resolves it against our origin, and a payload that could
   *  name another host would make a notification a redirect. */
  url: string;
}

/** Ceiling on the encrypted payload (ADR-0197 §6). The practical floor across push
 *  services is ~4 KB and Apple's is the tightest; 2 KB is well clear of it and still far
 *  more than four short strings need. Enforced by the sender, which drops a payload it
 *  cannot fit rather than sending a truncated one. */
export const PUSH_PAYLOAD_MAX_BYTES = 2048;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Reads a payload the worker was handed, or answers `null`.
 *
 * Never throws — see the header. The `url` check is the one with teeth: an absolute path
 * on our own origin, so a payload can only ever open a screen of ours.
 */
export function parsePushPayload(raw: unknown): PushPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!isNonEmptyString(value.kind)) return null;
  if (!isNonEmptyString(value.title)) return null;
  if (typeof value.body !== 'string') return null;
  if (!isNonEmptyString(value.url)) return null;
  // A single leading slash: `//host` is protocol-relative and would leave our origin.
  if (!value.url.startsWith('/') || value.url.startsWith('//')) return null;
  return {
    kind: value.kind as NotificationKind,
    title: value.title,
    body: value.body,
    url: value.url,
  };
}
