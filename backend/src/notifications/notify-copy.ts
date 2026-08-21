// **The words a notification says** (ADR-0198 §7), and the one thing about them that is not
// this app's usual problem.
//
// ── WHY THIS FILE IS ON THE SERVER, WHICH CONTRADICTS ADR-0198 §7 ─────────────────────────
//
// §7 says the copy goes "under a new `notify` namespace in `i18n/he.ts`". It cannot, and the
// reason is ADR-0197 §6, which shipped first: `PushPayload` carries `title` and `body` as
// finished STRINGS. The service worker draws what it was handed and never fetches on `push`
// — so whoever composes the string is whoever sends it, and that is the sweep. Moving the
// composition into the worker would mean either inlining `i18n/he.ts` (2,600 lines) into a
// bundle on the critical path of every install, which is exactly the cost `push.ts` refuses
// zod for, or a second copy of these strings. §7 is amended in place rather than worked
// around.
//
// So this is the **one** place the backend holds user-facing Hebrew, and it is worth saying
// what would change if a second locale ever arrived: the sweep would need the recipient's
// locale, which is a `User` column and a lookup table, not a rewrite of anything here. Today
// the app is Hebrew-only (ADR-0009) and pretending otherwise would be scaffolding.
//
// ── THE SHAPE, WHICH IS §7'S RULE ─────────────────────────────────────────────────────────
//
// **The title is the kind of obligation, the body is the subject.** The reverse reads as an
// advert. Every string below is that, and the tests assert the shape rather than the words.
//
// ── AND THE PART THAT IS GENUINELY NEW ────────────────────────────────────────────────────
//
// **The operating system draws these, so none of ADR-0118's bidi machinery reaches them.**
// `lib/bidi.ts`, `ltrIsolate`, the `dir` attributes are all app-side. A Hebrew string ending
// in a time can reorder on a lock screen in a way the app never shows. Hence: digits sit
// MID-STRING wherever a sentence allows it, `·` separates rather than parentheses or arrows,
// and none of this is settled until it has been seen on both platforms' lock screens — the
// device pass ADR-0198 §7 requires before phase A is called done.
import { NOTIFICATION_KIND, type PushPayload } from '@waypoint/shared';

/** A time as a lock screen should read it: `18:00`, in the zone the deadline means. Through
 *  `Intl` with an explicit zone, the same derivation `send-policy.ts` uses for quiet hours,
 *  so a printed hour and a fired hour cannot disagree. */
export function clockLabel(instantMs: number, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instantMs));
}

/** Where a task notification goes when tapped: the trip's task index (ADR-0004 — a
 *  notification is a way IN to a surface that already exists, never a second inbox). */
export function taskUrl(tripId: string): string {
  return `/trips/${tripId}/index/tasks`;
}

/** `task.due` — a deadline with an hour on it, at that hour.
 *
 *  The body ends in the hour rather than opening with it, because the subject is what a
 *  glance needs and the time is the qualifier. */
export function taskDuePayload(input: {
  tripId: string;
  title: string;
  dueAtMs: number;
  zone: string;
}): PushPayload {
  return {
    kind: NOTIFICATION_KIND.TASK_DUE,
    title: 'משימה להיום',
    body: `${input.title} · עד ${clockLabel(input.dueAtMs, input.zone)}`,
    url: taskUrl(input.tripId),
  };
}

/**
 * `task.digest` — the 08:00 roll-up, and the mechanism that makes a dated-**no-time** task
 * reachable at all (ADR-0198 §2). Most of what a person writes weeks out is a day with no
 * hour, so this is the pre-trip case rather than an edge one.
 *
 * **It names today and tomorrow**, in that order, which is the one addition that closes the
 * owner's "we don't want to miss any upcoming" without a second send.
 */
export function taskDigestPayload(input: {
  tripId: string;
  titles: string[];
  tomorrowCount: number;
}): PushPayload {
  const count = input.titles.length + input.tomorrowCount;
  return {
    kind: NOTIFICATION_KIND.TASK_DIGEST,
    title: digestTitle(count),
    body: digestBody(input.titles, input.tomorrowCount),
    url: taskUrl(input.tripId),
  };
}

/** `1 דבר` reads wrong in Hebrew; `דבר אחד` is what a person says. Hebrew's dual is not
 *  needed here — `2 דברים` is idiomatic — so this is the singular and everything else. */
function digestTitle(count: number): string {
  return count === 1 ? 'דבר אחד לסגור היום' : `${count} דברים לסגור היום`;
}

/**
 * Up to two subjects by name, then a count for the rest, then tomorrow's tail.
 *
 * **Two names, not five**, because a lock screen truncates and a list of five ends
 * mid-word — the count is the part that survives the cut.
 *
 * `titles` is never empty: the digest fires only when something is open and dated today or
 * overdue (ADR-0198 §2), and tomorrow is an addition to that message rather than a reason
 * to send one. So there is no empty-head branch to get wrong.
 */
function digestBody(titles: string[], tomorrowCount: number): string {
  const named = titles.slice(0, 2);
  const rest = titles.length - named.length;
  const today =
    rest > 0 ? `${named.join(', ')} ועוד ${rest === 1 ? 'אחד' : rest}` : named.join(', ');
  if (tomorrowCount === 0) return today;
  return `${today} · ${tomorrowCount === 1 ? 'ועוד אחד למחר' : `ועוד ${tomorrowCount} למחר`}`;
}

/**
 * `task.assigned` — the catalogue's one social send.
 *
 * **The copy departs from ADR-0198 §7's table, and the reason is not style.** That table
 * reads `דנה הטילה עליך משימה` — a feminine verb inflected from the NAME, which is a guess
 * about a real person that the app has no field for and no business making. Hebrew has no
 * neutral form of that verb, so the fix is not a different inflection but a construction
 * with no verb in it: the obligation in the title, the subject and the sender as peer facts
 * in the body, separated by the app's own `·`.
 *
 * It stays *addressed* — which is what earns this send its place against ADR-0081's
 * rejection of ambient awareness — because the title says בשבילך and the body says who.
 */
export function taskAssignedPayload(input: {
  tripId: string;
  title: string;
  assignerName: string;
  dueLabel: string | null;
}): PushPayload {
  const subject = input.dueLabel ? `${input.title} · עד ${input.dueLabel}` : input.title;
  return {
    kind: NOTIFICATION_KIND.TASK_ASSIGNED,
    title: 'משימה חדשה בשבילך',
    body: input.assignerName ? `${subject} · ${input.assignerName}` : subject,
    url: taskUrl(input.tripId),
  };
}
