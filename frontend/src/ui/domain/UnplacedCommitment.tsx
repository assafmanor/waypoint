// **A commitment that holds no position in the day** (ADR-0171 §10a-i), rendered at the top of
// the list rather than in a strip above it.
//
// **It IS a transition row now** (ADR-0219 §4), and the earlier reasoning here — "that row's
// whole grammar is a moment on a timeline" — was answering the wrong question. ADR-0210 §1 made
// the amber box and the 32px circle badge **the committed point's**, and an untimed commitment
// is a commitment without a moment: the same object, missing one fact. What said so was the
// strip it used to live in, which held three unrelated kinds of thing in one teal box — a day's
// distance total, Plan's fit verdict, a car hire's day count, and this. Splitting them by what
// they ARE (a fact about the day → a line in the head; a claim on your day → a row) is what
// makes the top of the day read, and it leaves this the third host of `.transition-row` rather
// than a fourth row grammar.
//
// WHY IT IS NOT AN IDEA EITHER, which is the correction that produced this file: "holds no
// position" is one DERIVATION, not one category on screen. Inside it `hard` and `soft` stay as
// different as ADR-0011 says — so a commitment reads at the top and an idea in the tail, and
// burying the first under the second is the demotion that rule exists to prevent. It stays
// ABOVE the first row and below the head, so §10a-i's "a claim on your day reads at the top"
// holds with no strip to hold it.
//
// It settles, and that is not decoration: ADR-0164 counts a check-in in `נותרו היום` until it
// is settled, so a host with no way to say `היינו` leaves that number stuck all evening.
// `SettleControl`'s `compact` density is the one this wants — and it is the density
// `TransitionRow` picked for this exact row shape, which is one more thing the two now share.
import { CATEGORY_DEFAULT_ICON, EVENT_STATUS, TIME_MEANING, type Booking } from '@waypoint/shared';
import { PlaceBadge } from './PlaceBadge';
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
  /** The settle pair, and it is **Trip mode's only** (ADR-0171 §10e). Plan settles
   *  through a sheet off the row menu and never inline on a row, and `נותרו היום` — the
   *  number that made settling load-bearing here — is a Trip-mode number. Omitted → the
   *  row is the same statement with no control on it, which is Plan's posture. */
  onDone?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
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
    <div className="transition-row">
      <button
        type="button"
        className="tr-face"
        disabled={!booking || !onOpen}
        onClick={() => booking && onOpen?.(booking)}
      >
        <PlaceBadge className="tr-badge">{icon}</PlaceBadge>
        <span className="tr-main">
          {label ? <span className="tr-label">{label}</span> : null}
          <span className="tr-title">{event.title}</span>
          <span className="tr-time">
            {/* **The box is open on the side time runs free** (ADR-0210 §2), and that is why
                the bound is derived rather than fixed at `exact`: a check-in "from 15:00" is a
                floor and gets the floor's open-ended box, the same shape it would wear one row
                down. `ללא שעה` is not a clock at all, so it takes `exact` — no box, because
                there is no bound to draw. */}
            <span
              className="tr-clock"
              data-bound={row.atMs == null ? TIME_MEANING.EXACT : TIME_MEANING.NOT_BEFORE}
            >
              {whenLabel(row, tz)}
            </span>
          </span>
        </span>
      </button>
      {onDone && onSkip && (
        <SettleControl
          variant="compact"
          outcome={outcome}
          onDone={onDone}
          onSkip={onSkip}
          onUndo={onUndo}
        />
      )}
    </div>
  );
}
