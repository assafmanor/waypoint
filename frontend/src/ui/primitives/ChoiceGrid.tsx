// One icon+label single-select grid. The document-type picker (upload + manage
// sheets) and, in shape, the booking-type picker all render the same grid of
// tappable icon/label cards with one selected — this folds that pattern into one
// controlled primitive so it stops being copy-pasted markup. Neutral chrome only
// (selected = --cta ring), never a semantic hue (design-language color budget).
import type { CSSProperties } from 'react';
import './choice-grid.css';

export interface Choice<T extends string> {
  value: T;
  /** Leading glyph (emoji or short symbol); decorative, hidden from a11y. */
  icon: string;
  label: string;
}

export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = options.length,
  disabled = false,
  ariaLabel,
}: {
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Cards per row. Defaults to one row of all options. */
  columns?: number;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className="choice-grid"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ '--choice-cols': columns } as CSSProperties}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={'choice-card' + (o.value === value ? ' on' : '')}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          <span className="choice-card-ic" aria-hidden="true">
            {o.icon}
          </span>
          <span className="choice-card-lbl">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
