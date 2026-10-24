// **A DERIVED TIME CLAIM, AND THE INSTANT BEHIND IT** (ADR-0226).
//
// Six times in three weeks (ADR-0206 §AJ3, §AY, §BB, §BD, §BF and the night-origin fix in #827)
// two surfaces said different things about one moment, and every one of them shipped green:
// the derivations are single-sourced, the RULE is written down twice (ADR-0159 §1,
// `frontend/CLAUDE.md`), and **no test renders more than one surface**, so a contradiction
// between them is the one property CI cannot see.
//
// This file is the other half of that repair. A surface that states a derived time tags the
// element with the instant it derived — so `surfaces.agreement.test.tsx` can put every surface
// in front of one fixture and compare the ANSWERS rather than the words.
//
// **Why the instant and not the text.** Two elevations are allowed to word one fact differently
// and the whole of ADR-0159 §1 rests on that: `יציאה עד 10:15` on the day and `7 דקות ליציאה` on
// the board are the same claim in two postures. Comparing rendered strings would either fail on
// posture or pass on nothing. The instant is what must match; the words are free.
//
// **Why the zone rides along.** §BD was a bug where both surfaces held the SAME instant and
// printed different clocks, because one kept the trip's zone after the other took it off. An
// instant-only tag reads that as agreement. Carrying the zone lets the suite check the second
// half — that the text is this instant rendered in the zone the surface declares.
//
// **Why a subject id.** Surfaces do not answer the same questions about the same things: the
// board states one leave-by (the next point's), the day states one per leg. Without naming the
// subject, the suite would compare a board's departure for dinner against a day's departure for
// the museum and report a disagreement that is two different facts. The comparison key is
// (kind, subject), never kind alone.
import { formatTime } from './time';

/**
 * **The closed set of derived time claims.** A claim belongs here when the app *computes* the
 * moment — the answer comes off a derivation and could be wrong. An event's own `startsAt`
 * printed on its own row is NOT one: it is the datum, so there is nothing for two surfaces to
 * disagree about and tagging it would drown the real claims in noise.
 *
 * Adding a member is the one-line extension this file is shaped for (root rule 8): tag the
 * render sites, and the agreement suite picks it up with no change of its own.
 */
export const TIME_FACT = {
  /** When you must leave for the next point — `heroLeaveBy`, the fact that has caused four of
   *  the six. Board, lifted hero, day row and Plan row all state it. */
  LEAVE_BY: 'leave-by',
  /** When the free time ends. **It ends at the departure** (ADR-0206 §AJ4.1), which is exactly
   *  what §BF found the board had never been told. */
  FREE_UNTIL: 'free-until',
  /** The estimated arrival off a leg's own travel time — `~15:55`, never a promised clock. */
  ARRIVE_AT: 'arrive-at',
} as const;
export type TimeFact = (typeof TIME_FACT)[keyof typeof TIME_FACT];

export interface TimeFactClaim {
  kind: TimeFact;
  /** The derived instant. */
  atMs: number;
  /** The zone the surface says it rendered that instant in (ADR-0107's resolved zone, never a
   *  default reached for). */
  zone: string;
  /** **The event the claim is ABOUT**, so two surfaces are compared on one subject. Absent is
   *  allowed for a claim with no single subject; such claims are compared by kind alone. */
  of?: string;
}

/** The attribute the suite reads. One name for every claim, so there is no second encoding to
 *  keep in step — and a composed line (`יציאה עד 15:12 · הגעה ~15:55` is one text run from
 *  `journeyMetaLine`) carries both of its claims without being broken into spans for the
 *  test's benefit. */
export const TIME_FACT_ATTR = 'data-facts';

/** Field and record separators. Chosen because neither can occur in an ISO instant, an IANA
 *  zone or an event id, so parsing needs no escaping. */
const FIELD = '|';
const RECORD = ';';

/**
 * **Tag an element with the derived instants it is stating.**
 *
 * Spread onto the element that renders the claim:
 * `<div {...timeFacts({ kind: TIME_FACT.FREE_UNTIL, atMs, zone, of: next.id })}>`
 *
 * `null`/`undefined` members are dropped, so a caller may pass a claim that is conditionally
 * absent without branching — the ordinary case on every one of these surfaces, where the
 * absence of an estimate is a first-class answer (ADR-0206 §D4).
 *
 * **It emits in production too.** The cost is a few dozen bytes on a handful of elements, and
 * what it buys is the class of report this repo actually runs on: a screenshot from a phone
 * becomes a readable record of what the screen believed, instead of a clock somebody has to
 * reason backwards from. Every bug in the list at the top of this file arrived that way.
 */
export function timeFacts(...claims: (TimeFactClaim | null | undefined)[]): Record<string, string> {
  const present = claims.filter((c): c is TimeFactClaim => !!c && Number.isFinite(c.atMs));
  if (present.length === 0) return {};
  return {
    [TIME_FACT_ATTR]: present
      .map((c) => [c.kind, new Date(c.atMs).toISOString(), c.zone, c.of ?? ''].join(FIELD))
      .join(RECORD),
  };
}

/**
 * **A stated time — the words a surface prints and the instant behind them, inseparable.**
 *
 * `Board` and `HeroLift` are presentational and deliberately read no zone: every time reaches
 * them pre-formatted (`Board.tsx`'s own rule). That is right, and it is also how a formatted
 * string arrives on a surface with nothing left to check it against — which is precisely how
 * §BF's `עד 10:30` sat ⁦100px⁩ from a tile counting to ⁦10:15⁩.
 *
 * So the two travel together. Build one with {@link statedTime}, which FORMATS FROM the instant
 * rather than taking the text on trust, and a call site cannot hand a surface a clock that does
 * not match the fact it is tagged with.
 */
export interface StatedTime {
  /** What the surface prints. */
  text: string;
  /** What it means. */
  fact: TimeFactClaim;
}

/**
 * **Build a stated time from the instant**, optionally wrapping the clock in this surface's own
 * words — `צאו ב־18:37` on the board, a bare `18:37` in the gap slot, `יציאה עד 18:37` on the
 * day row. The posture is the caller's (ADR-0159 §1); the moment is not.
 */
export function statedTime(
  fact: TimeFactClaim,
  phrase: (clock: string) => string = (clock) => clock,
): StatedTime {
  return { text: phrase(claimClock(fact)), fact };
}

/** Read back what {@link timeFacts} wrote. The suite's half of the contract; exported here so
 *  the encoding has exactly one owner. */
export function parseTimeFacts(attr: string | null | undefined): TimeFactClaim[] {
  if (!attr) return [];
  return attr.split(RECORD).flatMap((record) => {
    const [kind, iso, zone, of] = record.split(FIELD);
    const atMs = Date.parse(iso ?? '');
    if (!kind || !Number.isFinite(atMs) || !zone) return [];
    return [{ kind: kind as TimeFact, atMs, zone, ...(of ? { of } : {}) }];
  });
}

/** The clock a claim must be readable as, in its own declared zone — the check that catches
 *  §BD's shape, where the instants agreed and the printed clocks did not. */
export function claimClock(claim: TimeFactClaim): string {
  return formatTime(new Date(claim.atMs), claim.zone);
}
