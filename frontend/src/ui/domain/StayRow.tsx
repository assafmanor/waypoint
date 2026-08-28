// **WHERE THE DAY STARTS, AND WHERE IT ENDS** (ADR-0209 §1).
//
// The two facts the app holds for certain about a stay, because you slept there. Nothing else
// about one is positioned: a check-out's `09:40` is a ceiling and a check-in's `17:00` a floor, so
// where in the day you actually walked through the door is not something the app knows — and four
// drafts of ADR-0209 died trying to position it anyway.
//
// **It carries no clock**, which is what lets every leg stay an ordinary `JourneyBlock`. An earlier
// draft folded the leg's facts into this row to stop two rows printing two clocks for one
// departure; with no clock here there is nothing to contradict, so the day draws a leg one way.
// The stay's own bound rides alongside, quiet, positioning nothing.
//
// **It reuses `.transition-row`'s geometry deliberately** — same badge column, same title, same
// trailing slot — because it is the same kind of row: a compact, read-only reference to one end of
// a bracketed booking, tapping through to the read-only booking detail (ADR-0053). What it is not
// is a schedule block: ADR-0054 §2 stands in full, so no block, no rail width, and nothing added
// to `נותרו היום`.
//
// `ui/domain/`: presentational, every value via props.
import { type Booking, type TripEvent } from '@waypoint/shared';
import { PlaceBadge } from './PlaceBadge';
import { SettleControl, type SettleOutcome } from './SettleControl';
import { TitleLabel } from '../TitleLabel';
import { chosenIcon, DEFAULT_STAY_ICON } from '../../constants';

export function StayRow({
  stay,
  edge,
  bound,
  bookings,
  onOpen,
  onShowOnMap,
  outcome,
  onDone,
  onSkip,
  onUndo,
}: {
  stay: TripEvent;
  /** **Which end of the day this is** (ADR-0210 §4) — the direction the bracket opens,
   *  which is INTO the day: down on the row you woke in, up on the row you sleep in.
   *  `dayBookendStays` already answers this for both callers as `{woke, sleeps}`
   *  (ADR-0209 §1), so nothing new is derived; the row is only told which one it got.
   *  Required rather than defaulted: a bookend is always one end or the other, and a
   *  default would silently draw every stay as a wake row on the day a caller forgot. */
  edge: 'wake' | 'sleep';
  /** The stay's own constraint or count, already worded by the caller — `צ׳ק-אאוט · עד 09:40` from
   *  `edgeSentence` where the day is an edge of it, `לילה 2 מתוך 4` from `ambientSpanLabel` where it
   *  is not. Both sentences already existed, in the strip this row replaces. */
  bound?: string;
  bookings: readonly Booking[];
  onOpen: (booking: Booking) => void;
  /** Show the stay's place on our map (ADR-0121 §8), through the badge. */
  onShowOnMap?: () => void;
  /** **The settle pair, and it had to move here** (ADR-0209 §1). ADR-0184 §2 gave a *floor* its
   *  `היינו` in the list, and it is load-bearing rather than parity: `glance.ts` keeps a
   *  `not-before` edge in `נותרו היום` until it is `DONE`, because 15:01 does not mean anybody
   *  checked in (ADR-0171 §6). With the edge row gone, dropping this would re-open the report
   *  ADR-0184 §2 fixed. Trip mode supplies it and Plan supplies nothing, which is ADR-0171 §10e's
   *  posture difference. */
  outcome?: SettleOutcome;
  onDone?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
}) {
  const booking = stay.bookingId ? bookings.find((b) => b.id === stay.bookingId) : undefined;
  return (
    <div className={'transition-row stay-bookend' + (edge === 'sleep' ? ' at-sleep' : '')}>
      <button
        type="button"
        className="tr-face"
        onClick={() => booking && onOpen(booking)}
        disabled={!booking}
      >
        <PlaceBadge className="tr-badge" onShowOnMap={onShowOnMap}>
          {chosenIcon(stay.icon) ?? DEFAULT_STAY_ICON}
        </PlaceBadge>
        <span className="tr-main">
          <span className="tr-title">
            <TitleLabel title={stay.title} />
          </span>
          {bound && <span className="tr-bound">{bound}</span>}
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
