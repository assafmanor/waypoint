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

/** The kinds a payload can carry. One member today, and ADR-0198's catalogue fills it in
 *  from phase A: named constants rather than bare strings (ADR-0095), so a typo is a
 *  compile error at both ends of the wire instead of a notification nobody can route. */
export const NOTIFICATION_KIND = {
  /** The dev-only proof that the pipe works end to end. Never sent by the sweep. */
  TEST: 'test',
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
