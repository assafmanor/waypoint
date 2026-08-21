// The two rules the sweep applies to every candidate before it becomes a send (ADR-0197 §5,
// ADR-0198 §5), as pure functions over an injected clock.
//
// They are here rather than inline in the sweep because they are the parts worth testing
// exhaustively and the parts most likely to be argued about: "why did this arrive at 03:00"
// and "why did this not arrive at all" are both answered by one of these two functions.
import { currentZone, type ZoneCrossing } from '@waypoint/shared';

/**
 * **Quiet hours: no send between 22:00 and 07:00 in the recipient's own zone.**
 *
 * Constants, not preferences (ADR-0198 §6): a per-user pair of times is three more fields, a
 * validation surface and a zone question, to serve a disagreement nobody has voiced — and
 * the one case that would need it, an early flight, is handled by `timeCritical` overriding
 * the window entirely rather than by moving its edges.
 */
export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 7;

/** How a candidate fared against the window. Three outcomes, not a boolean, because
 *  **deferring and dropping are different** and the caller does different things with them. */
export const QUIET_VERDICT = {
  /** Outside the window, or `timeCritical`. Send now. */
  SEND: 'send',
  /** Inside the window and not critical. **Nothing is written and nothing is scheduled**:
   *  the candidate is simply re-derived on a tick after 07:00, and it carries the same
   *  `fireKey` then, so it arrives exactly once. Storing a defer would be the queue this
   *  design rejects — and it is why there is no `deferUntil` here computing an instant
   *  nobody would read. */
  DEFER: 'defer',
} as const;
export type QuietVerdict = (typeof QUIET_VERDICT)[keyof typeof QUIET_VERDICT];

/** The wall-clock hour an instant lands on in a named zone, 0-23. Through `Intl` with an
 *  explicit zone, which is the same derivation `todayInTz` uses — and deliberately not
 *  arithmetic on an offset, because an offset is a thing that changes twice a year. */
export function hourInZone(instantMs: number, zone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(instantMs));
  // `en-GB` gives `00`-`23`; `24` appears in some ICU versions for midnight, so fold it.
  return Number(formatted) % 24;
}

/** True when the wall clock at `instantMs`, read in `zone`, is inside the quiet window. The
 *  window wraps midnight, which is why this is an OR rather than a range check. */
export function isQuietHour(instantMs: number, zone: string): boolean {
  const hour = hourInZone(instantMs, zone);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

/**
 * Should this candidate go out now?
 *
 * The recipient's zone is resolved through the **display's own derivation** (ADR-0197 §5):
 * the itinerary segment holding the tick, falling back to the trip's primary zone. That is
 * what makes "22:00 for this traveller" mean the same thing here as it does on their screen —
 * and, before the first crossing, home rather than the destination.
 */
export function quietVerdict(input: {
  nowMs: number;
  crossings: ZoneCrossing[];
  primaryZone: string;
  timeCritical: boolean;
}): QuietVerdict {
  if (input.timeCritical) return QUIET_VERDICT.SEND;
  const zone = currentZone(input.nowMs, input.crossings, input.primaryZone);
  return isQuietHour(input.nowMs, zone) ? QUIET_VERDICT.DEFER : QUIET_VERDICT.SEND;
}

/**
 * **The per-source daily caps** (ADR-0198 §5) — we ration what the app decided to say, never
 * what a person asked to be reminded of.
 *
 * Keyed by the kind's own prefix rather than by an explicit per-kind number, so a kind added
 * to the catalogue inherits the right budget by being named honestly. `timeCritical` is
 * uncapped and never reaches this table.
 */
export const DAILY_CAP = {
  /** Someone typed this deadline. A safety ceiling against a pathological day, not a budget. */
  task: 6,
  /** The app decided to speak. This is the one that nags, so this is the one rationed. */
  nudge: 1,
  /** The digest replaces sends, so charging it like a nudge would be backwards. */
  digest: 1,
} as const;
export type DailySource = keyof typeof DAILY_CAP;

/** Which budget a kind draws on. A kind whose prefix names no source gets the tightest
 *  budget rather than an exemption — a new kind must earn its volume by being classified,
 *  and the failure direction is "too quiet", never "unbounded". */
export function dailySource(kind: string): DailySource {
  const prefix = kind.split('.')[0];
  if (prefix === 'task') return kind.endsWith('.digest') ? 'digest' : 'task';
  return 'nudge';
}

/** How many of `source`'s sends this user has left today, given what the ledger already
 *  holds. Never negative. */
export function remainingToday(source: DailySource, sentToday: number): number {
  return Math.max(0, DAILY_CAP[source] - sentToday);
}

/**
 * The ledger key for one aimed-at instant: the minute it was aimed at, in UTC.
 *
 * **The minute is the bucket, and it matches the tick's interval** — a 60-second sweep
 * cannot meaningfully distinguish finer, and a key with seconds in it would make two ticks
 * either side of a second boundary look like two different sends. UTC because a key is an
 * identity, not a thing anybody reads: resolving it per zone would make the same send
 * dedupe differently as a traveller crosses a border.
 */
export function fireKeyFor(aimedAtMs: number): string {
  return new Date(Math.floor(aimedAtMs / 60_000) * 60_000).toISOString().slice(0, 16);
}

/**
 * The fire key for a kind that dedups by SUBJECT rather than by instant
 * (`DEDUP.BY_SUBJECT`) — once per (recipient, subject), ever.
 *
 * A constant, and deliberately not a formatted instant: the ledger's unique key already
 * carries `userId`, `kind` and `subjectId`, so the only thing left to neutralise is the time
 * component. Written as a word rather than an empty string so a row in the table reads as a
 * decision instead of a bug.
 */
export const SUBJECT_FIRE_KEY = 'once';

/** The UTC day boundary the cap counts from, as an instant. Deliberately **not** the
 *  recipient's local day: a cap is a rate limit on our own behaviour, and re-basing it per
 *  traveller would give somebody crossing the date line two budgets. */
export function capWindowStart(nowMs: number): Date {
  return new Date(nowMs - 24 * 60 * 60 * 1000);
}

/** Is a candidate still worth sending, or did the tick that should have carried it get lost?
 *  A missed fire DROPS rather than arriving late (ADR-0197 §3) — a redeploy must not produce
 *  a burst of stale notifications. */
export function isStale(input: {
  nowMs: number;
  aimedAtMs: number;
  staleAfterMs: number;
}): boolean {
  return input.nowMs - input.aimedAtMs > input.staleAfterMs;
}
