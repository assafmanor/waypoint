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
import { CATEGORY_DEFAULT_ICON, type Booking } from '@waypoint/shared';
import { chosenIcon, DEFAULT_EVENT_ICON } from '../constants';
import { formatTime } from '../lib/time';
import { ZoneShiftPill } from './ZoneShiftPill';
import { TitleLabel } from './TitleLabel';
import { PlaceBadge } from './domain/PlaceBadge';
import { transitionLabel } from '../lib/transitions';
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
  const { event, edge, atMs, labelKey } = entry;
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const icon =
    chosenIcon(event.icon) ??
    (event.category != null ? CATEGORY_DEFAULT_ICON[event.category] : DEFAULT_EVENT_ICON);
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
            <TitleLabel title={event.title} />
          </span>
        </span>
        <span className="tr-time" dir="auto">
          {formatTime(new Date(atMs), zone ?? tz)}
          {deltaMinutes != null && <ZoneShiftPill minutes={deltaMinutes} className="tr-tzdelta" />}
        </span>
      </button>
      {edge === 'start' && onNavigate && (
        <button className="tr-nav" onClick={onNavigate}>
          {t.actions.navigate}
        </button>
      )}
    </div>
  );
}
