// **A parked event's own sheet** (ADR-0231 §2, fork F2; amends ADR-0116 §5a in place).
//
// A tap on a parked card used to RESTORE the event, and §5a kept it that way "because it has a
// surface of its own — its day row". A parked event has no day row; that is what parked means.
// And on a cancelled booking, restore is the wrong verb for the tap you make when you want the
// confirmation code for the refund — which ADR-0223 promised one tap from every surface that
// dropped it. So the card takes the idea's shape (§5a): a `RowManageSheet` whose FIRST action is
// what the tap used to do, and whose second is the read.
//
// One component for both day surfaces, so Plan and Trip cannot answer the tap differently.
import type { Booking, TripEvent } from '@waypoint/shared';
import { EVENT_KIND } from '@waypoint/shared';
import { RowManageSheet, type RowAction } from './domain';
import { TitleLabel } from './TitleLabel';
import { CONTROL_ICON, DOT_SEPARATOR } from '../constants';
import { clockRange, formatTime } from '../lib/time';
import { parkedTag } from '../lib/shelf';
import { t } from '../i18n/he';

export function ParkedEventSheet({
  event,
  bookings,
  tz,
  onRestore,
  onOpen,
  onClose,
}: {
  event: TripEvent;
  bookings: readonly Booking[];
  /** The zone the row's times read in — the day's, as the card beside it. */
  tz: string;
  /** Back onto the day, in place — `verbs.restore`. */
  onRestore: () => void;
  /** The read: `BookingDetail` for a booked event, `EventDetail` otherwise — the host's branch
   *  (ADR-0229 §1), which is why the label is decided here and the destination there. */
  onOpen: () => void;
  onClose: () => void;
}) {
  const booked = !!event.bookingId && bookings.some((b) => b.id === event.bookingId);
  const actions: RowAction[] = [
    { label: t.day.parked.restore, icon: CONTROL_ICON.restore, onSelect: onRestore },
    {
      label: booked ? t.hero.toBooking : t.day.read.details,
      icon: booked ? 'ticket' : 'eye',
      onSelect: onOpen,
    },
  ];
  // The subject line (ADR-0138 §3): kind, slot, and the state the card wears — the three facts
  // that decide what `שחזור ליום` would put back.
  const subject = [
    event.kind === EVENT_KIND.HARD ? t.event.hard : t.event.soft,
    event.startsAt &&
      clockRange(formatTime(event.startsAt, tz), event.endsAt && formatTime(event.endsAt, tz)),
    parkedTag(event, bookings),
  ]
    .filter(Boolean)
    .join(` ${DOT_SEPARATOR} `);
  return (
    <RowManageSheet
      title={<TitleLabel title={event.title} />}
      subject={subject}
      actions={actions}
      onClose={onClose}
    />
  );
}
