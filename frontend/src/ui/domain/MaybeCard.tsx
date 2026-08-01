// MaybeCard — the "maybe" shelf idea card (design-language: MaybeShelf). It was
// duplicated in screens/DayView.tsx (~788) and screens/PlanDay.tsx (~1067): a
// dashed, diagonal-hatch card (the soft grammar, ADR-0011) you tap to open. Two
// shapes share the card:
//   • a plain tappable card (DayView shelf) — the whole card is the open
//     button, and it can render `disabled` (a consumed idea);
//   • a card with a `✕` remove affordance (PlanDay shelf) — the body is the
//     open button and a corner button removes the idea.
//
// **The tap is `onOpen`, and what it opens is the host's business** (ADR-0116's
// 2026-08-01 amendment). It was `onSchedule` until an idea gained notes: an idea's
// tile is the only shelf card with no surface that says "here is this idea", so a
// tap now opens its manage sheet, with `שיבוץ ליום` as that sheet's first action.
// The prop is renamed rather than doubled because a skipped card was already
// passing `restore` through a prop called `onSchedule` — the card never knew what
// the tap meant, and now it says so.
//
// The meta line takes a REAL optional `meta` prop. The old copies rendered the
// `maybeMeta(id)` FIXTURE (U-07), which returned text only for seeded demo ids
// and '' for real items — a dead slot. This component omits the line when `meta`
// is absent; screens pass a real derived field or nothing. The fixture is gone.
//
// Presentational only: data + copy via props, no trip-state, no domain types.
import { type ReactNode } from 'react';
import type { HoldToDragProps } from '../../lib/useHoldToDrag';
import './maybe-card.css';
import { Icon } from '../Icon';
import { NoteMark } from './NoteMark';

export interface MaybeCardProps {
  /** Idea glyph (emoji content). */
  icon: ReactNode;
  title: ReactNode;
  /** Real derived meta (source / added-by / …). Omitted → the line is not shown. */
  meta?: ReactNode;
  /** The bottom action line, e.g. "＋ שבץ ליום" — screen passes copy + icon.
   *  A `compact` tile has none: the section hint above the strip says it once. */
  action?: ReactNode;
  /** The shelf tile (ADR-0116 session-202 §2): same soft grammar, row axis, no
   *  action line. Geometry only — every other state comes from the base card. */
  compact?: boolean;
  /** How many notes this idea carries (ADR-0153 §7). It rides the tile's CORNER, in
   *  padding the card already has, because the meta line belongs to ADR-0151's
   *  ranking reason and a second line cost 8px on a 76px tile drawn to save them.
   *  Read-only, like every mark (§8) — the reach is the sheet the tap opens. */
  notes?: number;
  /** The card's primary tap. An idea tile opens its sheet; a skipped card restores
   *  the event. Never "schedule" — that is one action inside the idea's sheet. */
  onOpen: () => void;
  /** Disables the tap (a consumed idea kept visible, dimmed). */
  disabled?: boolean;
  /** When set, renders a corner `✕` remove button (the PlanDay shelf shape). */
  onRemove?: () => void;
  /** Accessible name for the remove button (required with `onRemove`). */
  removeLabel?: string;
  /** Extra modifier class (e.g. a screen's `skipped-card`). */
  className?: string;
  /** Handlers that make the card draggable onto a gap (ADR-0116 §5) — from
   *  `useHoldToDrag`, which arms on a press-and-hold so the strip and the page keep
   *  scrolling normally. The card only has to carry them. */
  dragProps?: HoldToDragProps;
  /** This card is the one currently being dragged. */
  dragging?: boolean;
}

export function MaybeCard({
  icon,
  title,
  meta,
  action,
  compact,
  notes,
  onOpen,
  disabled,
  onRemove,
  removeLabel,
  className,
  dragProps,
  dragging,
}: MaybeCardProps) {
  // Title + meta always get the wrapper, so there is one markup shape rather than
  // two: it is `display: contents` on the base card (laying out exactly as before)
  // and the block the row axis stacks on under `.compact`.
  const inner = (
    <>
      <span className="wp-maybecard-ic">{icon}</span>
      <span className="wp-maybecard-main">
        <span className="wp-maybecard-title">{title}</span>
        {meta != null && <span className="wp-maybecard-meta">{meta}</span>}
      </span>
      {action != null && <span className="wp-maybecard-add">{action}</span>}
    </>
  );
  const cls =
    'wp-maybecard' +
    (compact ? ' compact' : '') +
    (disabled ? ' consumed' : '') +
    (dragging ? ' dragging' : '') +
    (dragProps ? ' draggable' : '') +
    (className ? ` ${className}` : '');

  // The mark sits in the corner opposite the `✕` (top-inline-start against its
  // top-inline-end, `maybe-card.css`), so the two shipped corner affordances cannot
  // meet — and it is above the glyph rather than beside it, which is the adjacency
  // ADR-0153 §7's correction says to check.
  const mark = <NoteMark count={notes} />;

  // Remove variant: a container with a corner button + a body button, so the
  // remove control isn't nested inside the open button.
  if (onRemove) {
    return (
      <div className={cls} {...dragProps}>
        {mark}
        <button
          type="button"
          className="wp-maybecard-remove"
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <Icon name="close" />
        </button>
        <button type="button" className="wp-maybecard-body" onClick={onOpen} disabled={disabled}>
          {inner}
        </button>
      </div>
    );
  }

  return (
    <button type="button" className={cls} onClick={onOpen} disabled={disabled} {...dragProps}>
      {mark}
      {inner}
    </button>
  );
}

/**
 * The last item on a capped pool strip: the way through to the rest
 * (ADR-0116 session-202 §5). It borrows the tile's BOX and deliberately not its
 * grammar — solid rather than dashed, no hatch, neutral `--cta` — because it is a
 * navigation, not an idea, and must not read as one more thing you could schedule.
 *
 * Its own component rather than a `MaybeCard` prop: the card's every other prop
 * (schedule, remove, drag, consumed) is meaningless here, and `onSchedule` holding a
 * tab navigation is the kind of misnaming a reader has to un-learn.
 */
export function MaybeMoreCard({
  label,
  icon,
  onOpen,
}: {
  label: ReactNode;
  icon: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="wp-maybecard compact more" onClick={onOpen}>
      {icon}
      <span className="wp-maybecard-title">{label}</span>
    </button>
  );
}
