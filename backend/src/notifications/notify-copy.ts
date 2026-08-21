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

// ── PHASE B — the trip's own commitments (ADR-0198 §2) ─────────────────────────────────────
//
// Two of these are the catalogue's only `timeCritical` rows, which changes what the words are
// for: a 03:30 notification about a 05:30 flight has to be readable in one glance from a lock
// screen, half asleep. So the title carries the COUNTDOWN and the body carries the identity —
// the reverse of phase A, where the obligation is the title because the hour is the qualifier.

/** Where tapping an event notification goes: the day it belongs to (ADR-0004 — a notification
 *  is a way IN to a surface that already exists). */
export function eventUrl(tripId: string, dateKey: string): string {
  return `/trips/${tripId}/day/${dateKey}`;
}

/** How long until something, as a lock screen should read it. Hebrew's dual is what makes this
 *  more than a number: `שעתיים` is a word, not `2 שעות`, and getting it wrong is the kind of
 *  thing a person notices immediately. */
export function untilLabel(minutes: number): string {
  if (minutes < 1) return 'עוד רגע';
  if (minutes < 60) return `בעוד ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return 'בעוד שעה';
  if (hours === 2) return 'בעוד שעתיים';
  return `בעוד ${hours} שעות`;
}

/**
 * `event.hard.soon` — a hard commitment, its category's lead ahead of it.
 *
 * The title is the countdown because that is the fact that makes it urgent; the body is what
 * and where, with the hour last so a truncated line still says which thing it is about.
 */
export function eventSoonPayload(input: {
  tripId: string;
  dateKey: string;
  title: string;
  leadMinutes: number;
  startsAtMs: number;
  zone: string;
}): PushPayload {
  return {
    kind: NOTIFICATION_KIND.EVENT_HARD_SOON,
    title: `${input.title} ${untilLabel(input.leadMinutes)}`,
    body: `${clockLabel(input.startsAtMs, input.zone)}`,
    url: eventUrl(input.tripId, input.dateKey),
  };
}

/**
 * **The word for a span's own edge.**
 *
 * The KEY is derivable on the server — `CATEGORY_TIME_PROFILE.transitions`, refined by
 * `ICON_TIME_PROFILE`, is shared code — but the Hebrew is not: `i18n/he.ts` owns the app's
 * words and `packages/shared/CLAUDE.md` is explicit that UI copy does not move there.
 *
 * **So these are the notification's OWN words, and that is a claim rather than a shortcut.**
 * A lock screen is a different register from a rail marker, which ADR-0198 §7 already
 * establishes for every other string in this file — the digest's `3 דברים לסגור היום` appears
 * nowhere in the app either. Today six of these coincide with `t.…transition`'s, and the
 * honest statement is that the coincidence is not enforced: re-word the rail and this does not
 * follow. If that ever matters, the fix is the same one §7.1 describes for a second locale —
 * the words become data the server can look up, not a copy that has to be kept in step by
 * hand.
 *
 * Keyed on the shared `transitions` keys so a mode that refines its wording
 * (`ICON_TIME_PROFILE`) is picked up here for free, and an unknown key falls back rather than
 * printing a key name at somebody.
 */
const SPAN_EDGE_WORD: Record<string, string> = {
  checkIn: 'צ׳ק-אין',
  checkOut: 'צ׳ק-אאוט',
  departure: 'יציאה',
  arrival: 'הגעה',
  flightDeparture: 'המראה',
  flightArrival: 'נחיתה',
  carPickup: 'איסוף הרכב',
  carDropoff: 'החזרת הרכב',
};

/** The edge's own word, or a neutral one. `שלב` rather than the key, because a person seeing
 *  `checkOut` on a lock screen is worse than a person seeing a vague noun. */
export function spanEdgeWord(transitionKey: string | undefined): string {
  return (transitionKey && SPAN_EDGE_WORD[transitionKey]) || 'שלב בטיול';
}

/**
 * `span.edge.soon` — a check-in, check-out, pick-up or return, an hour out.
 *
 * The caller passes the word (`spanEdgeWord` above); this stays a formatter.
 */
export function spanEdgePayload(input: {
  tripId: string;
  dateKey: string;
  edgeWord: string;
  subject: string;
  atMs: number;
  zone: string;
}): PushPayload {
  return {
    kind: NOTIFICATION_KIND.SPAN_EDGE_SOON,
    title: `${input.edgeWord} עד ${clockLabel(input.atMs, input.zone)}`,
    body: input.subject,
    url: eventUrl(input.tripId, input.dateKey),
  };
}

/**
 * `trip.tomorrow` — 19:00 the evening before day 1.
 *
 * The one row that fires before the trip has anything timed in it, so it names the trip and
 * the first thing on it. `firstThing` is null when day 1 has nothing timed, which is common
 * enough to be the normal case rather than an edge one.
 */
export function tripTomorrowPayload(input: {
  tripId: string;
  dateKey: string;
  tripName: string;
  firstThing: { title: string; atMs: number; zone: string } | null;
}): PushPayload {
  const { firstThing } = input;
  return {
    kind: NOTIFICATION_KIND.TRIP_TOMORROW,
    title: 'נוסעים מחר',
    body: firstThing
      ? `${input.tripName} · ${firstThing.title} ב-${clockLabel(firstThing.atMs, firstThing.zone)}`
      : input.tripName,
    url: eventUrl(input.tripId, input.dateKey),
  };
}
