// **A commitment that holds no position in the day** (ADR-0171 §10a-i), rendered in
// the strip above the list rather than in it.
//
// WHY IT IS NOT A `TransitionRow`. That row's whole grammar is a moment on a timeline:
// it interleaves by instant and its amber says "time + commitment". This one is the
// opposite claim — the app does not know when this happens, only that it is yours to
// do today. A check-in "from 15:00" is a floor, open on the side you act, so no reading
// of the clock places it; an untimed booking is the same fact with a wider window.
//
// WHY IT IS NOT AN IDEA EITHER, which is the correction that produced this file: "holds
// no position" is one DERIVATION, not one category on screen. Inside it `hard` and
// `soft` stay as different as ADR-0011 says — so a commitment reads at the top and an
// idea in the tail, and burying the first under the second is the demotion that rule
// exists to prevent.
//
// It settles, and that is not decoration: ADR-0164 counts a check-in in `נותרו היום`
// until it is settled, so a host with no way to say `היינו` leaves that number stuck
// all evening. `SettleControl`'s existing `compact` density is the one this wants —
// icon-only beside a label that needs the width — so no new density is minted.
import { CATEGORY_DEFAULT_ICON, EVENT_STATUS, type Booking } from '@waypoint/shared';
import { SettleControl, type SettleOutcome } from './SettleControl';
import { transitionLabel } from '../../lib/transitions';
import { isoToTimeInput } from '../../lib/time';
import { chosenIcon, DEFAULT_EVENT_ICON } from '../../constants';
import { t } from '../../i18n/he';
import type { UnplacedRow } from '../../lib/day-entries';

/** What the row says instead of a position: the floor it opens at, or that there is no
 *  clock at all. `exact` never reaches here — an exact time IS a position. */
function whenLabel(row: UnplacedRow, tz: string): string {
  if (row.atMs == null) return t.day.noTime;
  return t.day.fromTime(isoToTimeInput(new Date(row.atMs).toISOString(), tz));
}

export function UnplacedCommitment({
  row,
  tz,
  bookings,
  onDone,
  onSkip,
  onUndo,
  onOpen,
}: {
  row: UnplacedRow;
  tz: string;
  bookings: readonly Booking[];
  onDone: () => void;
  onSkip: () => void;
  onUndo: () => void;
  /** Opens the booking behind it, exactly as the transition row does. A row with no
   *  booking (a manual `hard` event with no clock) has nothing to open. */
  onOpen?: (booking: Booking) => void;
}) {
  const { event } = row;
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const icon =
    chosenIcon(event.icon) ??
    (event.category != null ? CATEGORY_DEFAULT_ICON[event.category] : DEFAULT_EVENT_ICON);
  const outcome =
    event.status === EVENT_STATUS.DONE || event.status === EVENT_STATUS.SKIPPED
      ? (event.status as SettleOutcome)
      : undefined;
  const label = row.labelKey ? transitionLabel(row.labelKey) : undefined;
  return (
    <div className="ambient unplaced">
      <span className="ai" aria-hidden="true">
        {icon}
      </span>
      <button
        type="button"
        className="an as-open"
        disabled={!booking || !onOpen}
        onClick={() => booking && onOpen?.(booking)}
      >
        {event.title}
      </button>
      <span className="as">{label ? `${label} · ${whenLabel(row, tz)}` : whenLabel(row, tz)}</span>
      <SettleControl
        variant="compact"
        outcome={outcome}
        onDone={onDone}
        onSkip={onSkip}
        onUndo={onUndo}
      />
    </div>
  );
}
