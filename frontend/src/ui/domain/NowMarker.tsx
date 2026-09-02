// **THE APP'S ONE "YOU ARE HERE" MARK** (ADR-0217 §1), and it exists because there were three.
//
// Root rule 8 / ADR-0096, in its "generalise the one-off rather than adding a fourth beside it"
// form. Before this there were three implementations of one fact, none shared:
//
//  - `DayView`'s `NowLine` — `.nowline`, amber, took a `Date` and a `tz`
//  - `PlanDay`'s `NowRef` — `.nowref`, violet, took epoch ms and a `tz`
//  - `SharedItinerary`'s `NowLine` — `.nowline` again, whose own comment said `DayView`'s
//    "is not imported because it is that screen's local component and takes …"
//
// That last comment is the finding: what kept them apart was not the look, it was the SHAPE of
// the input. The shared reader has no instants at all — the public projection deliberately
// ships pre-formatted `HH:MM` labels so two renderers cannot format one instant two ways
// (ADR-0213 §11) — so any component taking a `Date` locks it out by construction. **This one
// takes a formatted `label`**, which every host already has: the day surfaces call
// `formatTime(now, tz)` and the shared reader calls `shareTimeLabel`. Formatting stays where
// the zone knowledge is, and the mark stops caring.
//
// Two forms, one component, and the difference is a single prop:
//
//  - **nailed to a row** — pass `children` and `thruFrac`; it wraps the row and puts the arrow
//    at that fraction of its height. This is the form the report was about: the moment is
//    INSIDE something and the mark says so instead of floating above it.
//  - **at a boundary** — pass neither; it is a mark between two rows, with room of its own
//    and the clock on it. Every instant no row holds: before the day's first row, after its
//    last, and inside a hole `dayBlocks` draws no row for (a join needs `prevEnd && start`).
//
// **The two forms differ about the caption, and that is not an inconsistency.** §1 made the
// mark a shape rather than a words-and-a-clock row for a stated reason: the row it is inside
// already carries the word. A boundary mark has no such row, so there the premise is absent
// and the mark says the time itself (the 2026-09-02 amendment, drawn in
// `where-the-marker-stands-when-nothing-holds-it-v1.html`).
//
// What it deliberately does NOT answer is *which* rows hold the moment. There can be several —
// ADR-0041's forest puts `now` inside a festival and the concert inside it — and the app
// already says so with `.wp-event.now`'s amber ring. Ring = who, plural; this = exactly where,
// singular.
import type { ReactNode } from 'react';
import type React from 'react';
import { t } from '../../i18n/he';
import './now-marker.css';

/** Trip mode is live; Plan mode is a static reference and may never read as live (ADR-0043
 *  §5). The shared reader takes `LIVE`: it is a real clock on a real day, and ADR-0213 §11
 *  already had it reusing the Trip mark class for class. */
export const NOW_POSTURE = {
  LIVE: 'live',
  PLAN: 'plan',
} as const;
export type NowPosture = (typeof NOW_POSTURE)[keyof typeof NOW_POSTURE];

export function NowMarker({
  ref,
  label,
  posture = NOW_POSTURE.LIVE,
  thruFrac,
  children,
}: {
  /** So a host can land on the mark. `DayView` scrolls it into view once per day-open
   *  (ADR-0043 §1), and that has to keep working now the mark is a row's wrapper rather
   *  than a row of its own. */
  ref?: React.Ref<HTMLDivElement>;
  /** The clock, already formatted by whoever owns the zone (`formatTime` / `shareTimeLabel`).
   *  It is the accessible name in both forms, and the visible text in the boundary one —
   *  where no row carries the word, so nothing else on the screen says it. */
  label: string;
  posture?: NowPosture;
  /** How much of the wrapped row is behind us, `0..1`. Required with `children`; ignored
   *  without them, because a boundary has no row to be a fraction of. */
  thruFrac?: number;
  /** The row the moment is inside. Absent → the boundary form. */
  children?: ReactNode;
}) {
  const inside = children !== undefined;
  return (
    <div
      ref={ref}
      className={'now-here' + (inside ? '' : ' edge')}
      data-posture={posture}
      // The same accessible name `.nowline` and `.nowref` both carried, so a screen reader
      // hears no change from a mark that moved from between the rows into one of them.
      aria-label={t.day.nowLineAria(label)}
      // Clamped rather than trusted: `thruFrac` comes from a clock and a row's own bounds,
      // and a stale render between a tick and a re-derivation is the one way it can arrive
      // outside its range. A mark half a pixel off is invisible; one at `-40%` is a mark
      // pointing at the row above.
      style={
        inside
          ? ({
              '--thru': `${Math.min(1, Math.max(0, thruFrac ?? 0)) * 100}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* `.nowline-chip` and `.nowline-dot` are `screens.css`'s, still shipped for the public
          reader — the same chip, so two surfaces cannot say `now` two ways (rule 8). `dir="auto"`
          is what keeps a digits-only run from being laid out by the page's RTL base direction
          (ADR-0118); it needs no isolate, because a string with no strong character resolves to
          `ltr` on its own. */}
      {inside ? (
        children
      ) : (
        <span className="nowline-chip">
          <span className="nowline-dot" aria-hidden="true" />
          <span dir="auto">{label}</span>
        </span>
      )}
    </div>
  );
}
