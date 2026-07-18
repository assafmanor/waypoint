// A per-day transition entry (ADR-0064 §B): a compact, read-only reference row
// for one edge of a multi-day bracketed booking — badge + transition label (from
// the profile, ADR-0063) + booking title + mono time, amber (time + commitment).
// Tapping opens the read-only booking detail (ADR-0053), where edit/delete live;
// it carries NO inline settle/skip/delay verbs (mutating half a derived span is
// ambiguous). Shared by the Trip-mode day view and the Plan-mode builder so the
// grammar can't diverge. A start edge (check-in / departure) offers Navigate —
// but only when a caller supplies `onNavigate` (Trip mode, live day). Plan mode
// has no live "now", so it passes none; a read-only past day passes none too.
import { CATEGORY_DEFAULT_ICON, type Booking, type TripEvent } from '@waypoint/shared';
import { formatTime } from '../lib/time';
import { transitionLabel } from '../lib/transitions';
import { t } from '../i18n/he';
import type { TransitionEntry } from '../lib/day-entries';

export function TransitionRow({
  entry,
  tz,
  bookings,
  onOpen,
  onNavigate,
}: {
  entry: TransitionEntry;
  tz: string;
  bookings: Booking[];
  onOpen: (booking: Booking) => void;
  onNavigate?: (event: TripEvent) => void;
}) {
  const { event, edge, atMs, labelKey } = entry;
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const icon =
    event.icon ?? (event.category != null ? CATEGORY_DEFAULT_ICON[event.category] : '📌');
  return (
    <div className="transition-row">
      <button
        type="button"
        className="tr-face"
        onClick={() => booking && onOpen(booking)}
        disabled={!booking}
      >
        <span className="tr-badge" aria-hidden="true">
          {icon}
        </span>
        <span className="tr-main">
          <span className="tr-label">{transitionLabel(labelKey)}</span>
          <span className="tr-title">{event.title}</span>
        </span>
        <span className="tr-time" dir="ltr">
          {formatTime(new Date(atMs), tz)}
        </span>
      </button>
      {edge === 'start' && onNavigate && (
        <button className="tr-nav" onClick={() => onNavigate(event)}>
          {t.actions.navigate}
        </button>
      )}
    </div>
  );
}
