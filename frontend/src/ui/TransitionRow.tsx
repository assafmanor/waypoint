// A per-day transition entry (ADR-0064 §B): a compact, read-only reference row
// for one edge of a multi-day bracketed booking — badge + transition label (from
// the profile, ADR-0063) + booking title + mono time, amber (time + commitment).
// Tapping opens the read-only booking detail (ADR-0053), where edit/delete live;
// it carries NO inline settle/skip/delay verbs (mutating half a derived span is
// ambiguous). Shared by the Trip-mode day view and the Plan-mode builder so the
// grammar can't diverge. A start edge (check-in / departure) offers Navigate —
// but only when a caller supplies `onNavigate` (Trip mode, live day, and the
// booking has a mappable location). Plan mode has no live "now", so it passes
// none; a read-only past day, or a location-less booking, passes none too.
import { CATEGORY_DEFAULT_ICON, edgeMeaning, windowBoundOf, type Booking } from '@waypoint/shared';
import { chosenIcon, DEFAULT_EVENT_ICON } from '../constants';
import { formatTime } from '../lib/time';
import { ltrIsolate } from '../lib/bidi';
import { ZoneShiftPill } from './ZoneShiftPill';
import { TitleLabel } from './TitleLabel';
import { PlaceBadge } from './domain/PlaceBadge';
import { transitionLabel } from '../lib/transitions';
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
  // **The window, if this edge has one** (ADR-0184 §5). Both bounds render in this
  // edge's own zone, like the single clock does.
  //
  // `ltrIsolate` is not optional and not decoration: a range is a run of digits with a
  // separator and NO strong character, so it takes its direction from whatever contains
  // it. It survives here today because `.tr-time` carries `dir="auto"` (which falls back
  // to ltr with no strong character) — and it would flip the moment a Hebrew word joined
  // it in this box, which is exactly what happens one component over in
  // `UnplacedCommitment`. Isolating the RUN is the rule that holds in both (ADR-0118).
  const windowBound = windowBoundOf(event, edge);
  const range = windowBound
    ? ltrIsolate(
        `${formatTime(new Date(Math.min(atMs, Date.parse(windowBound))), zone ?? tz)}–${formatTime(
          new Date(Math.max(atMs, Date.parse(windowBound))),
          zone ?? tz,
        )}`,
      )
    : null;
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
          {/* **A RANGE GOES UNDER THE TITLE; A BARE TIME DOES NOT** (ADR-0184 §5, owner's
              call on the mockup). `.tr-time` is `flex: 0 0 auto` + `nowrap` at the row's
              trailing edge, and `.tr-title` is the only thing here that ellipsises — so a
              range, being about twice a clock's width, took 45px of 210 off a long hotel
              name at 360px. Under the title it gets the full width and the row pays 20px
              of height, charged ONLY to a row that has a window. This is `EventCard`'s own
              answer (`'badge title' / 'badge when'`), reused rather than re-decided. */}
          {range && (
            <span className="tr-time wnd-under" dir="auto">
              {range}
            </span>
          )}
        </span>
        {!range && (
          <span className="tr-time" dir="auto">
            {/* **A ceiling says so** (ADR-0171 §3). A check-out reads `עד 11:00`, because
              11:00 is a deadline rather than the moment it happens — and the row may
              have been pinned earlier than 11:00 by a flight leaving before it (§10b),
              which makes an unmarked clock actively wrong. `exact` stays unmarked: it
              is the default, and marking it would put a word on nearly every row in
              the app to say "normal". A floor never reaches this row at all — it holds
              no position, so it renders in the strip above the list. */}
            {edgeMeaning(event, edge) === 'not-after'
              ? t.day.untilTime(formatTime(new Date(atMs), zone ?? tz))
              : formatTime(new Date(atMs), zone ?? tz)}
            {deltaMinutes != null && (
              <ZoneShiftPill minutes={deltaMinutes} className="tr-tzdelta" />
            )}
          </span>
        )}
      </button>
      {edge === 'start' && onNavigate && (
        <button className="tr-nav" onClick={onNavigate}>
          {t.actions.navigate}
        </button>
      )}
    </div>
  );
}
