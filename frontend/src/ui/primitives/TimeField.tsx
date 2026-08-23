// TimeField — the shared single-time picker atom behind BOTH the event
// TimePicker's start field and the booking span's endpoint times (one complex
// primitive, two behaviours). A tap-to-open trigger — since ADR-0177 a `ValueToken`
// in amber, with no VISIBLE caption because the prose around it says which time this
// is; the caption stays as hidden text so the accessible name is still "התחלה 08:00".
// It opens a panel: a native exact <input type="time"> fallback (ADR-0036
// §2c) + a 15-minute scroll list that centres the current value — or the
// nearest-round suggestion for an off-grid value — on open, and AUTO-CLOSES on
// pick. It owns no duration / date / overnight semantics: the event composes it
// with a duration field (single day), the span composes it with a date field and
// a second endpoint (multi-day).
//
// Layout: the trigger and its panel are siblings; the panel carries
// flex-basis:100% + order (via .tp-panel) so inside the flex-wrap field row it
// wraps to a full-width line BELOW all the row's triggers — never nested in a
// flex trigger, never an absolute popover the overflow-y:auto sheet would clip.
import { Fragment, useState } from 'react';
import { useBackLayer } from '../../state/nav-state';
import { useCenterSelected } from '../../lib/useCenterSelected';
import { MINUTES_PER_DAY } from '../../constants';
import { ValueToken } from './ValueToken';
import { t } from '../../i18n/he';

const STEP = 15;
// The wall-clock pair lives in `lib/time.ts` now — `lib/gaps.ts` needs it too and could not
// import a UI primitive to get it (and kept a character-identical copy of `toHHMM` instead).
// Re-exported here because every existing caller imports it from this file.
import { toHHMM, toMin } from '../../lib/time';
export { toHHMM, toMin };
const ALL_TIMES = Array.from({ length: MINUTES_PER_DAY / STEP }, (_, i) => i * STEP);

/** **What a moment that FOLLOWS another one offers, and in what order** (ADR-0203 §10).
 *
 *  Reported from the field: _"it always starts at 00:00 no matter the departure… it should
 *  always start ahead of the departure time… If it crosses midnight maybe even make it
 *  circular"_. The list is rotated to begin one step after `afterMin` and wrap through
 *  midnight back to `afterMin` itself, which lands last.
 *
 *  **This is not a scroll position, it is the rule the days already follow.**
 *  `resolveJourneyDays` resolves every moment to the nearest FORWARD instant after the one
 *  before it, and a list that opens at 00:00 is the only part of the rail that does not read
 *  forward. Rotating it makes scrolling DOWN mean later, which is what the derivation means.
 *
 *  **Rotated, never filtered.** `minTime` filters, and that is right for a bound — an end
 *  before its own start on the same date is impossible. Here nothing is impossible: an
 *  arrival at 00:45 after a 20:30 departure is tomorrow, not an error, so removing it would
 *  remove the answer. All 96 slots stay; only the order changes.
 *
 *  What that buys is measured rather than asserted: the row a one-hour leg lands on runs
 *  2–86 today depending on where midnight happens to fall relative to the departure, and is
 *  always 3 rotated. The distance stops being decided by a fact about nothing. */
export function offeredFrom(afterMin: number, times: readonly number[]): number[] {
  const at = times.indexOf(afterMin);
  if (at < 0) return [...times];
  return [...times.slice(at + 1), ...times.slice(0, at + 1)];
}

/** The nearest round (15-min) slot to a minute-of-day, capped at the last slot
 *  (23:45) so the suggestion is always a real list row. Suggests — never mutates
 *  — a round time when reopening on an off-grid value. */
export function nearestRoundSlot(min: number): number {
  return Math.min(Math.round(min / STEP) * STEP, MINUTES_PER_DAY - STEP);
}

/** The selected row — or the nearest-round suggestion — sits at the vertical centre of its
 *  list on open. This list wrote its own `scrollTop` arithmetic before `useCenterSelected`
 *  existed; both lists now attach that hook's ref to whichever row is the target, keyed on
 *  the open state so each opening re-centres. `axis: 'block'` is the only difference from a
 *  chip strip, and the reason the hook scrolls one scroller rather than calling
 *  `scrollIntoView`: centring a row here must not also scroll the sheet behind it. */
export function useCentredTimeRow(open: boolean, target: number | null) {
  return useCenterSelected<HTMLButtonElement>(target, { axis: 'block', active: open });
}

export function TimeField({
  value,
  onChange,
  label,
  placeholder,
  open: openProp,
  onOpenChange,
  onClear,
  minTime,
  maxTime,
  afterTime,
  dayOffsetOf,
  triggerClassName,
}: {
  value: string; // HH:MM or ''
  onChange: (hhmm: string) => void;
  label: string;
  placeholder: string;
  /** Controlled open (for a composer coordinating sibling panels); omit for self-managed. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When provided and a value is set, the panel shows a "clear" footer. */
  onClear?: () => void;
  /** **The earliest time this field may name**, `HH:MM`, EXCLUSIVE — only times strictly
   *  after it are offered, and the exact `<input type="time">` gets the matching `min`
   *  (field report #4). Its one caller is the span's END, and only while that end sits on
   *  the same calendar day as its start: an arrival before its own departure is not a
   *  refusal worth making if the slot was never offered. A later day passes nothing, which
   *  is what keeps an overnight flight and a multi-day stay offering the full 24 hours. */
  minTime?: string;
  /** **The latest time this field may name**, `HH:MM`, EXCLUSIVE — `minTime`'s mirror,
   *  added for the check-out window (ADR-0184 §2), whose FLOOR must fall before the
   *  deadline beside it. Same posture as its twin: the impossible slot is never offered,
   *  so no refusal has to explain it afterwards. */
  maxTime?: string;
  /** **The moment this one FOLLOWS**, `HH:MM` — the previous clock in a chain. Rotates the
   *  offered order to start just after it and wrap through midnight (see `offeredFrom`); it
   *  never removes a slot, so it is safe on a hard commitment.
   *
   *  Its one caller today is the journey rail, and that is by construction rather than by
   *  omission: `transportProfile` sets `inMotion: true` for flight, train and transit and
   *  nothing else, and all three also title from their route — so every booking type whose
   *  span is spent in motion IS a journey. What is left in `WhenField` is a stay and a hire,
   *  whose two endpoints are independent times of day, and where anchoring the second on the
   *  first would be WRONG rather than merely unnecessary: a checkout at 11:00 does not
   *  follow from a check-in at 15:00, and anchoring would bury it 44 rows down. */
  afterTime?: string;
  /** **How many days after the journey's date a given clock lands on**, so the list can say
   *  where the day turns without ever computing one.
   *
   *  It cannot be drawn at local midnight: Tokyo 21:00 → Honolulu 09:00 is the SAME day,
   *  because the flight also crossed nineteen hours westward — the case ADR-0203 §2 exists
   *  for, and one a midnight divider would announce as `למחרת` while the derivation reads it
   *  as today. So the host, which owns the two zones, answers it through the same
   *  `resolveJourneyDays` everything else reads. Omitted → no divider. */
  dayOffsetOf?: (hhmm: string) => number;
  triggerClassName?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenState(o));

  const floor = minTime ? toMin(minTime) : null;
  const ceiling = maxTime ? toMin(maxTime) : null;
  const bounded = ALL_TIMES.filter(
    (m) => (floor == null || m > floor) && (ceiling == null || m < ceiling),
  );
  // Bounds first, then order: a filter decides WHICH slots exist and the anchor decides the
  // order they are read in, so composing them is well-defined even though no caller passes
  // both today.
  const times = afterTime ? offeredFrom(toMin(afterTime), bounded) : bounded;
  /** The first offered slot that lands on a later day than the one before it — where the
   *  divider goes. Read off `dayOffsetOf`, never from midnight: a westward crossing keeps the
   *  same day past 00:00, and guessing here is the bug ADR-0203 §2 exists to prevent. */
  const turnAt = (() => {
    if (!dayOffsetOf || times.length === 0) return null;
    let previous = dayOffsetOf(toHHMM(times[0]));
    for (let i = 1; i < times.length; i++) {
      const offset = dayOffsetOf(toHHMM(times[i]));
      if (offset > previous) return times[i];
      previous = offset;
    }
    return null;
  })();
  // The native input's `min`/`max` are inclusive, so each bound's neighbouring minute is
  // the first legal one — clamped away entirely at the ends of the day, where there is no
  // later (or earlier) minute to name.
  const exactMin = floor != null && floor + 1 < MINUTES_PER_DAY ? toHHMM(floor + 1) : undefined;
  const exactMax = ceiling != null && ceiling > 0 ? toHHMM(ceiling - 1) : undefined;

  const min = value ? toMin(value) : null;
  const suggest = min != null && min % STEP !== 0 ? nearestRoundSlot(min) : null;
  // Exactly one row matches: `suggest` is set only when `min` is off-grid, and every row is
  // on the grid — so the two conditions below can never both find one.
  const centredRow = useCentredTimeRow(open, min);
  const pick = (m: number) => {
    onChange(toHHMM(m));
    setOpen(false);
  };

  // **THE PANEL IS A BACK LAYER** (owner, session 176). Its `.tp-backdrop` exists purely so a
  // tap outside closes it — an implicit way out — so a system back owes the same one. Without
  // this, back fell through to the host form's layer and discarded the whole form. Registered
  // on the open state, so the layer lands above the form's and peels first.
  useBackLayer(() => {
    setOpen(false);
    return { remainsActive: false };
  }, open);

  return (
    <>
      {/* The trigger is a `ValueToken` (ADR-0177 §2): the cap that used to sit inside
          the box is gone. The caption survives as hidden text inside the button, so the
          accessible name is still "התחלה 08:00" — see `ValueToken`'s `label`. */}
      <ValueToken
        kind="time"
        open={open}
        empty={!value}
        className={triggerClassName}
        label={label}
        onClick={() => setOpen(!open)}
      >
        <span dir="auto">{value || placeholder}</span>
      </ValueToken>

      {open && <div className="tp-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="tp-panel">
          <div className="tp-exact">
            <span className="tp-exact-lbl">{t.eventForm.exactStart}</span>
            <input
              type="time"
              step={60}
              min={exactMin}
              max={exactMax}
              lang="he"
              dir="ltr"
              className="tp-time-input"
              value={value}
              onChange={(e) => e.target.value && pick(toMin(e.target.value))}
            />
          </div>
          <div className="tp-list">
            {times.map((m) => (
              <Fragment key={m}>
                {/* The day turning, INSIDE the list — so the relative day is visible while
                    choosing rather than stated afterwards. Not a `<button>`: that class owns
                    a row's border and its 44px box, and reusing it drew a dead option. */}
                {m === turnAt && (
                  <div className="tp-list-turn" aria-hidden="true">
                    {t.journey.nextDay}
                  </div>
                )}
                <button
                  ref={m === min || m === suggest ? centredRow : undefined}
                  type="button"
                  className={
                    m === min ? 'tp-list-on' : m === suggest ? 'tp-list-suggest' : undefined
                  }
                  onClick={() => pick(m)}
                >
                  <span dir="auto">{toHHMM(m)}</span>
                </button>
              </Fragment>
            ))}
          </div>
          {onClear && value && (
            <button
              type="button"
              className="tp-panel-clear"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              {t.eventForm.noTime}
            </button>
          )}
        </div>
      )}
    </>
  );
}
