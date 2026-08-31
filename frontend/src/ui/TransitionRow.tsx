// A per-day transition entry (ADR-0064 §B): a compact, read-only reference row
// for one edge of a multi-day bracketed booking — badge + transition label (from
// the profile, ADR-0063) + booking title + mono time, amber (time + commitment).
// Tapping opens the read-only booking detail (ADR-0053), where edit/delete live;
// it carries no inline delay/swap verbs (mutating half a derived span is ambiguous)
// — but it DOES settle a floor, since 2026-08-13, when floors moved into the list
// from the strip that used to carry that control. See `onDone` below for why that is
// a count rather than a nicety. Shared by the Trip-mode day view and the Plan-mode
// builder so the grammar can't diverge. A start edge (check-in / departure) offers Navigate —
// but only when a caller supplies `onNavigate` (Trip mode, live day, and the
// booking has a mappable location). Plan mode has no live "now", so it passes
// none; a read-only past day, or a location-less booking, passes none too.
import {
  CATEGORY_DEFAULT_ICON,
  edgeMeaning,
  EVENT_STATUS,
  TIME_MEANING,
  type Booking,
} from '@waypoint/shared';
import { SettleControl, type SettleOutcome } from './domain/SettleControl';
import { chosenIcon, DEFAULT_EVENT_ICON } from '../constants';
import { ZoneShiftPill } from './ZoneShiftPill';
import { TitleLabel } from './TitleLabel';
import { PlaceBadge } from './domain/PlaceBadge';
import { edgeTimePhrase, transitionLabel } from '../lib/transitions';
import { parseRouteTitle } from '../lib/route-title';
import { placeLabelOf } from '../lib/place-label';
import { usePlaceLabels } from '../state/place-labels';
import { t } from '../i18n/he';
import type { TransitionEntry } from '../lib/day-entries';

export function TransitionRow({
  entry,
  tz,
  zone,
  deltaMinutes,
  bookings,
  onOpen,
  onNavigate,
  onShowOnMap,
  onDone,
  onSkip,
  onUndo,
}: {
  entry: TransitionEntry;
  tz: string;
  /** This edge's display zone (ADR-0107): a departure reads its origin zone, an
   *  arrival its destination zone. Falls back to `tz` when not zone-wired. */
  zone?: string;
  /** Signed minutes this edge's clock differs from the day's ambient zone, when
   *  non-zero — rendered as an amber shift pill. Usually absent (each edge files
   *  under the day it lands in, whose ambient is that edge's own zone). */
  deltaMinutes?: number;
  bookings: Booking[];
  onOpen: (booking: Booking) => void;
  onNavigate?: () => void;
  /** Show the edge's place on our map (ADR-0121 §8). Unlike `onNavigate` this is
   *  offered on BOTH edges and in both modes: where you check OUT of is as much a
   *  place on the map as where you check in, and orientation is not a live-only
   *  question the way directions are. */
  onShowOnMap?: () => void;
  /** **The settle pair, on a FLOOR only** — inherited wholesale from
   *  `UnplacedCommitment` when floors moved from the strip into the list (2026-08-13),
   *  and it is load-bearing rather than parity: `glance.ts` keeps a `not-before` edge in
   *  `נותרו היום` until it is `DONE`, because 15:01 does not mean anybody checked in
   *  (ADR-0171 §6). Without a way to say `היינו` here the number the owner reported on
   *  2026-08-04 sticks all evening. A ceiling and a window expire by their own clock and
   *  need none; Trip mode supplies these and Plan supplies nothing, which is ADR-0171
   *  §10e's posture difference and not a fact.
   *
   *  This is the one thing the header comment above still says this row does not do — so:
   *  it settles a floor, and only a floor. */
  onDone?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
}) {
  const placeLabels = usePlaceLabels();
  const { event, edge, atMs, labelKey } = entry;
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  // **THIS EDGE'S OWN END, not the whole route** (owner, 2026-08-06: _"the landing row is very
  // long and unreadable, perhaps we should just display the relevant place?"_).
  //
  // A transport booking's title IS its route (`routeTitle`, ADR-0059 §3), and this row is about
  // ONE end of it — which the row already says in its own label: `נחיתה`, `צ׳ק-אאוט`. So the
  // other endpoint is not context, it is the half that pushed the relevant one off the row. And
  // it truncated the WRONG WAY round: `פרנקפורט (Frankfurter Flughafen – FRA) ← ב` kept the
  // airport you left in full and cut the one you landed at to a single letter.
  //
  // Shortened with the same `shortPlaceLabel` every other glanceable route surface uses — which
  // strips category noise and NOT a parenthesised official name, so a long endpoint is still
  // long and this change is worth exactly one half of the row. Anything that is not a route
  // title is untouched: an ordinary event keeps its own name.
  const route = parseRouteTitle(event.title);
  const endpoint = route && (edge === 'end' ? route.to : route.from);
  // **The place's own label wins over the title's copy of its name** (ADR-0166 §18): the
  // booking is in hand and knows which row this is, so a landing row reads `תל אביב · TLV`
  // where the stored title still holds whatever the place was called when it was written.
  // Falls back to the parsed endpoint, which is what this row has always shown.
  const endPlaceId = booking && (edge === 'end' ? booking.toPlaceId : booking.fromPlaceId);
  const title = placeLabelOf(placeLabels, endPlaceId, endpoint || undefined) ?? event.title;
  const icon =
    chosenIcon(event.icon) ??
    (event.category != null ? CATEGORY_DEFAULT_ICON[event.category] : DEFAULT_EVENT_ICON);
  // **What this edge's clock says is `edgeTimePhrase`'s** (`lib/transitions.ts`), not this
  // row's — the ambient strip above the list says the same fact now, and one edge saying two
  // things on one screen is the defect that would follow from writing it twice. Both bounds
  // render in this edge's own zone, like the single clock does.
  const meaning = edgeMeaning(event, edge);
  const time = edgeTimePhrase(event, edge, atMs, zone ?? tz);
  return (
    <div className="transition-row">
      <button
        type="button"
        className="tr-face"
        onClick={() => booking && onOpen(booking)}
        disabled={!booking}
      >
        <PlaceBadge className="tr-badge" onShowOnMap={onShowOnMap}>
          {icon}
        </PlaceBadge>
        <span className="tr-main">
          <span className="tr-label">{transitionLabel(labelKey)}</span>
          <span className="tr-title">
            <TitleLabel title={title} />
          </span>
          {/* **THE TIME GOES UNDER THE TITLE, WHATEVER IT SAYS** (owner, 2026-08-13,
              replacing ADR-0184 §5's split). A range already read here and a bare clock
              read at the row's trailing edge, which made this the one row in the app whose
              time moved depending on its own content — and against `EventCard`
              (`'badge title' / 'badge when'`) and Plan's builder row, which both put every
              time under the title, it was the row that stood out.

              Two things were wrong with the trailing edge, not one. `.tr-title` is the only
              element here that ellipsises, so the time was charged against a long hotel
              name (measured at 360px: 45px of 210 for a range). And `dir="auto"` on this
              box resolved the ELEMENT to ltr — a digits-only run has no strong character —
              so its inherited `text-align: start` meant *left*, and the one time that had
              already moved under the title sat at the wrong margin. The attribute is gone
              and every clock is isolated at the run instead (ADR-0118).

              Cost, stated because it is charged to every transition row now and not only to
              a windowed one: ~20px of height. */}
          <span className="tr-time">
            {/* **The clock says what KIND of bound it is** (ADR-0210 §2). `meaning` is
                already in hand a few lines up — `edgeTimePhrase` asks the same question to
                choose the word — so the shape costs a wrapper and an attribute, and it
                cannot drift from the word beside it. The attribute carries the derivation's
                own value rather than a mapped class name, so a fifth `TimeMeaning` would
                arrive here as a stylesheet question and not a TypeScript one.
                `ZoneShiftPill` stays OUTSIDE the box: it annotates the clock, it is not
                part of the bound. */}
            <span className="tr-clock" data-bound={meaning}>
              {time}
            </span>
            {deltaMinutes != null && (
              <ZoneShiftPill minutes={deltaMinutes} className="tr-tzdelta" />
            )}
          </span>
        </span>
      </button>
      {/* `compact` is the density `UnplacedCommitment` already picked for this exact row
          shape — icon-only beside a label that needs the width — so nothing new is minted
          (ADR-0139's Consequences: four settle affordances drifted before one collected
          them). Gated on the MEANING, not on the props alone: only a floor is cleared by
          being settled. */}
      {meaning === TIME_MEANING.NOT_BEFORE && onDone && onSkip && (
        <SettleControl
          variant="compact"
          outcome={
            event.status === EVENT_STATUS.DONE || event.status === EVENT_STATUS.SKIPPED
              ? (event.status as SettleOutcome)
              : undefined
          }
          onDone={onDone}
          onSkip={onSkip}
          onUndo={onUndo}
        />
      )}
      {edge === 'start' && onNavigate && (
        <button className="tr-nav" onClick={onNavigate}>
          {t.actions.navigate}
        </button>
      )}
    </div>
  );
}
