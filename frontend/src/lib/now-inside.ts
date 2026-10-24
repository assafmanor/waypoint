// **WHICH ROW HOLDS A MOMENT, AND HOW FAR THROUGH IT WE ARE** — the half of "where is now"
// that has three consumers and belonged to none of them (ADR-0217 §1/§2).
//
// The app has THREE markers for one fact, each with its own placement and its own markup:
// `DayView`'s live now-line, `PlanDay`'s static now-reference, and the shared reader's copy
// (`SharedItinerary`, whose own comment says it does not import `DayView`'s "because it is that
// screen's local component"). Root rule 8 / ADR-0096: generalise the one-off rather than adding a
// fourth beside it. `lib/now-line.ts` reads `DayEntry` instants; `lib/share-now-line.ts` reads
// pre-formatted `HH:MM` labels because the public projection deliberately ships no instants
// (ADR-0213 §11) — so what they can share is not a signature, it is this RULE.
//
// **Deliberately unit-agnostic**, which is what makes it shareable at all: `start`/`end` are
// plain numbers on one axis. The day surfaces pass epoch milliseconds; the shared reader passes
// `dawnOrder`'s minutes-from-the-share's-own-day-start, which is a different unit and the same
// arithmetic. Nothing here parses, formats, resolves a zone or reads `Date.now()` — pure and
// injected, like `gap-character.ts` and `day-track.ts`.
//
// It answers ONE question and refuses the neighbouring one: which single row the marker is
// nailed to. **Which rows hold the moment is a different question with a different answer** —
// there can be several (ADR-0041's forest puts `now` inside a festival AND the concert inside
// it), and the app already answers it with `.wp-event.now`'s amber ring. Ring = who, plural;
// marker = exactly where, singular.

/** One row's extent on whatever axis the caller is counting in. */
export interface NowSpan {
  /** The caller's own key for the row — an event id, a group key, a gap's slot key. Returned
   *  verbatim, so a host can look the row back up without this file knowing what a row is. */
  key: string;
  start: number;
  /** Exclusive. A zero-length span (`end === start`) can never hold a moment, which is how a
   *  check-in, a landing and a car pick-up stay ahead of us or behind us but never around us
   *  (ADR-0210 §1) — no caller has to special-case a point. */
  end: number;
  /** Excluded from consideration while true. Trip mode passes it for a settled row: once you
   *  have answered "we were there", "how far through" is not a question (ADR-0217 §4). */
  settled?: boolean;
}

/** The row the marker is nailed to, and how much of it is behind us (0..1). */
export interface NowInside {
  key: string;
  /** `0` at the row's start, approaching `1` at its end. Never exactly `1`: `end` is
   *  exclusive, so a row that has finished does not hold the moment at all. */
  thruFrac: number;
}

const holds = (span: NowSpan, now: number) =>
  !span.settled && span.end > span.start && now >= span.start && now < span.end;

/**
 * **The innermost holder: the row that started most recently, and the shorter of two that
 * started together.**
 *
 * One comparison covers both shapes of overlap, which is why this is not a tree walk.
 * For an ENVELOPE it is containment — a concert inside a festival starts later than the
 * festival, always, because a strict container starts no later than what it contains
 * (`spanContains`, `lib/time.ts`). For a CLUSTER neither peer contains the other and
 * containment has no answer at all, so the rule reads as "the thing you most recently walked
 * into", which is the honest sentence for two things happening at once.
 *
 * The tie-break is length, not `key`: two rows starting on the same minute are ordered by
 * which is more specific, so the ⁦45⁩-minute talk inside the ⁦4⁩-hour pass wins even when the
 * pass opens on the same instant. Ordering by key would make the answer depend on an id.
 *
 * `null` for every instant no row holds — before the day, after it, and inside a hole. That is
 * three real situations and not an error; a caller puts the marker at a boundary there.
 */
export function nowInside(spans: readonly NowSpan[], now: number): NowInside | null {
  let best: NowSpan | undefined;
  for (const span of spans) {
    if (!holds(span, now)) continue;
    if (
      !best ||
      span.start > best.start ||
      (span.start === best.start && span.end - span.start < best.end - best.start)
    ) {
      best = span;
    }
  }
  return best ? { key: best.key, thruFrac: (now - best.start) / (best.end - best.start) } : null;
}
