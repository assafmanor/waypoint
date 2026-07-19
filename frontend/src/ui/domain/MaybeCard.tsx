// MaybeCard — the "maybe" shelf idea card (design-language: MaybeShelf). It was
// duplicated in screens/DayView.tsx (~788) and screens/PlanDay.tsx (~1067): a
// dashed, diagonal-hatch card (the soft grammar, ADR-0011) you tap to schedule
// an idea onto a day. Two shapes share the card:
//   • a plain tappable card (DayView shelf) — the whole card is the schedule
//     button, and it can render `disabled` (a consumed idea);
//   • a card with a `✕` remove affordance (PlanDay shelf) — the body is the
//     schedule button and a corner button removes the idea.
//
// The meta line takes a REAL optional `meta` prop. The old copies rendered the
// `maybeMeta(id)` FIXTURE (U-07), which returned text only for seeded demo ids
// and '' for real items — a dead slot. This component omits the line when `meta`
// is absent; screens pass a real derived field or nothing. The fixture is gone.
//
// Presentational only: data + copy via props, no trip-state, no domain types.
import { type ReactNode } from 'react';
import './maybe-card.css';

export interface MaybeCardProps {
  /** Idea glyph (emoji content). */
  icon: ReactNode;
  title: ReactNode;
  /** Real derived meta (source / added-by / …). Omitted → the line is not shown. */
  meta?: ReactNode;
  /** The bottom action line, e.g. "＋ שבץ ליום" — screen passes copy + icon. */
  action: ReactNode;
  /** Schedule this idea onto the active day. */
  onSchedule: () => void;
  /** Disables scheduling (a consumed idea kept visible, dimmed). */
  disabled?: boolean;
  /** When set, renders a corner `✕` remove button (the PlanDay shelf shape). */
  onRemove?: () => void;
  /** Accessible name for the remove button (required with `onRemove`). */
  removeLabel?: string;
  /** Extra modifier class (e.g. a screen's `skipped-card`). */
  className?: string;
}

export function MaybeCard({
  icon,
  title,
  meta,
  action,
  onSchedule,
  disabled,
  onRemove,
  removeLabel,
  className,
}: MaybeCardProps) {
  const inner = (
    <>
      <span className="wp-maybecard-ic">{icon}</span>
      <span className="wp-maybecard-title">{title}</span>
      {meta != null && <span className="wp-maybecard-meta">{meta}</span>}
      <span className="wp-maybecard-add">{action}</span>
    </>
  );
  const cls = 'wp-maybecard' + (disabled ? ' consumed' : '') + (className ? ` ${className}` : '');

  // Remove variant: a container with a corner button + a body button, so the
  // remove control isn't nested inside the schedule button.
  if (onRemove) {
    return (
      <div className={cls}>
        <button
          type="button"
          className="wp-maybecard-remove"
          onClick={onRemove}
          aria-label={removeLabel}
        >
          ✕
        </button>
        <button
          type="button"
          className="wp-maybecard-body"
          onClick={onSchedule}
          disabled={disabled}
        >
          {inner}
        </button>
      </div>
    );
  }

  return (
    <button type="button" className={cls} onClick={onSchedule} disabled={disabled}>
      {inner}
    </button>
  );
}
