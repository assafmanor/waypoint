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
import { MINUTES_PER_DAY } from '../../constants';
import { t } from '../../i18n/he';

const STEP = 15;
const pad = (n: number) => String(n).padStart(2, '0');
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const ALL_TIMES = Array.from({ length: MINUTES_PER_DAY / STEP }, (_, i) => i * STEP);

/** The nearest round (15-min) slot to a minute-of-day, capped at the last slot
 *  (23:45) so the suggestion is always a real list row. Suggests — never mutates
 *  — a round time when reopening on an off-grid value. */
export function nearestRoundSlot(min: number): number {
  return Math.min(Math.round(min / STEP) * STEP, MINUTES_PER_DAY - STEP);
}

/** Scroll the selected row — or the nearest-round suggestion — to the vertical
 *  centre of its list on open. Shared by the start list and the duration list. */
export function centreSelected(list: HTMLDivElement | null) {
  const on = list?.querySelector<HTMLElement>('.tp-list-on, .tp-list-suggest');
  if (on && list) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.clientHeight / 2;
}

export function TimeField({
  value,
  onChange,
  label,
  placeholder,
  open: openProp,
  onOpenChange,
  onClear,
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
  triggerClassName?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenState(o));

  const min = value ? toMin(value) : null;
  const suggest = min != null && min % STEP !== 0 ? nearestRoundSlot(min) : null;
  const pick = (m: number) => {
    onChange(toHHMM(m));
    setOpen(false);
  };

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
        <span className="tp-val" dir="ltr">
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
              lang="he"
              dir="ltr"
              className="tp-time-input"
              value={value}
              onChange={(e) => e.target.value && pick(toMin(e.target.value))}
            />
          </div>
          <div className="tp-list" ref={centreSelected}>
            {ALL_TIMES.map((m) => (
              <button
                key={m}
                type="button"
                className={m === min ? 'tp-list-on' : m === suggest ? 'tp-list-suggest' : undefined}
                onClick={() => pick(m)}
              >
                <span dir="ltr">{toHHMM(m)}</span>
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
