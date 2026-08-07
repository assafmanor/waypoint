// TimeField — the shared single-time picker atom behind BOTH the event
// TimePicker's start field and the booking span's endpoint times (one complex
// primitive, two behaviours). A tap-to-open trigger (cap + amber value, .tp-field
// chrome) opens a panel: a native exact <input type="time"> fallback (ADR-0036
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
import { useState } from 'react';
import { useBackLayer } from '../../state/nav-state';
import { useCenterSelected } from '../../lib/useCenterSelected';
import { MINUTES_PER_DAY } from '../../constants';
import { t } from '../../i18n/he';

const STEP = 15;
// The wall-clock pair lives in `lib/time.ts` now — `lib/gaps.ts` needs it too and could not
// import a UI primitive to get it (and kept a character-identical copy of `toHHMM` instead).
// Re-exported here because every existing caller imports it from this file.
import { toHHMM, toMin } from '../../lib/time';
export { toHHMM, toMin };
const ALL_TIMES = Array.from({ length: MINUTES_PER_DAY / STEP }, (_, i) => i * STEP);

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
  triggerClassName?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenState(o));

  const floor = minTime ? toMin(minTime) : null;
  const times = floor == null ? ALL_TIMES : ALL_TIMES.filter((m) => m > floor);
  // The native input's `min` is inclusive, so the floor's own minute is the first legal
  // one — clamped away entirely at 23:59, where there is no later minute to name.
  const exactMin = floor != null && floor + 1 < MINUTES_PER_DAY ? toHHMM(floor + 1) : undefined;

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
      <button
        type="button"
        className={
          'tp-field' + (triggerClassName ? ` ${triggerClassName}` : '') + (open ? ' open' : '')
        }
        onClick={() => setOpen(!open)}
      >
        <span className="tp-cap">{label}</span>
        <span className="tp-val" dir="auto">
          {value || <span className="tp-placeholder">{placeholder}</span>}
        </span>
      </button>

      {open && <div className="tp-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="tp-panel">
          <div className="tp-exact">
            <span className="tp-exact-lbl">{t.eventForm.exactStart}</span>
            <input
              type="time"
              step={60}
              min={exactMin}
              lang="he"
              dir="ltr"
              className="tp-time-input"
              value={value}
              onChange={(e) => e.target.value && pick(toMin(e.target.value))}
            />
          </div>
          <div className="tp-list">
            {times.map((m) => (
              <button
                key={m}
                ref={m === min || m === suggest ? centredRow : undefined}
                type="button"
                className={m === min ? 'tp-list-on' : m === suggest ? 'tp-list-suggest' : undefined}
                onClick={() => pick(m)}
              >
                <span dir="auto">{toHHMM(m)}</span>
              </button>
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
