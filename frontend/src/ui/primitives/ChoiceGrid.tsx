// One icon+label single-select grid. The document-type picker (upload + manage
// sheets) and, in shape, the booking-type picker all render the same grid of
// tappable icon/label cards with one selected — this folds that pattern into one
// controlled primitive so it stops being copy-pasted markup. Neutral chrome only
// (selected = --cta ring), never a semantic hue (design-language color budget).
import type { CSSProperties } from 'react';
import './choice-grid.css';

export interface Choice<T extends string> {
  value: T;
  /** Leading glyph (emoji or short symbol); decorative, hidden from a11y. An
   *  empty string omits the icon slot entirely (e.g. a plain "all" option). */
  icon: string;
  label: string;
  /** Trailing count badge, `pills` layout only (the Index category filter,
   *  ADR-0100 §2 — each chip carries label+icon+count). Decorative/aria-hidden
   *  like the icon, so it never changes the option's accessible name.
   *  `undefined` omits the slot entirely. */
  count?: number;
}

export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = options.length,
  disabled = false,
  ariaLabel,
  layout = 'grid',
}: {
  options: Choice<T>[];
  /** The selected value, or `undefined` for no selection yet (a single-select
   *  that starts unset — e.g. the optional event category, ADR-0109 §11). No
   *  option is highlighted until one matches. */
  value?: T;
  onChange: (value: T) => void;
  /** Cards per row. Defaults to one row of all options. Ignored in `pills` layout. */
  columns?: number;
  disabled?: boolean;
  ariaLabel?: string;
  /** `grid` (default) — a fixed CSS grid of icon-over-label cards (form pickers).
   *  `pills` — a horizontally-scrollable row of icon+label pills (the Index
   *  category filter, ADR-0098 §reuse: too many options for a fixed grid on a
   *  narrow phone). Same controlled single-select radiogroup either way. */
  layout?: 'grid' | 'pills';
}) {
  const pills = layout === 'pills';
  return (
    <div
      className={'choice-grid' + (pills ? ' pills' : '')}
      role="radiogroup"
      aria-label={ariaLabel}
      style={pills ? undefined : ({ '--choice-cols': columns } as CSSProperties)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={(pills ? 'choice-pill' : 'choice-card') + (o.value === value ? ' on' : '')}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {pills ? (
            <>
              <span>{o.label}</span>
              {o.icon !== '' && <span aria-hidden="true">{o.icon}</span>}
              {o.count !== undefined && (
                <span className="choice-pill-count" aria-hidden="true">
                  {o.count}
                </span>
              )}
            </>
          ) : (
            <>
              {o.icon !== '' && (
                <span className="choice-card-ic" aria-hidden="true">
                  {o.icon}
                </span>
              )}
              <span className="choice-card-lbl">{o.label}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
