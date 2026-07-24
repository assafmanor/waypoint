// ListRow + RowManageSheet — the shared "open-body + right slot + ⋯→manage" row
// pattern (review U-03/§11). Before this it was solved twice: the Index booking
// row (`.li.bk`, screens/Index.tsx) and the Documents row (`.li.doc`,
// ui/DocumentsSection.tsx) carried near-identical markup that drifted. One row:
// a tappable open-body (badge + title/meta) that fires `onOpen`, a `right` slot
// for trailing content (a confirmation code, a size, a per-row SyncBadge — the
// Wave-2 sync wiring), and an optional `⋯` kebab that the screen wires to a
// RowManageSheet (edit/delete/…).
//
// Presentational only (dependency direction, §12): all data + copy come via
// props; no trip-state, no domain types beyond ReactNode. Rows live inside the
// screen's `.listcard` container, which owns the card frame + row dividers.
import { type ReactNode } from 'react';
import { Sheet } from '../Sheet';
import './list-row.css';

/** Category tint on the leading badge (ADR-0059 §3): teal for a stay, amber for
 *  transport. Omit for the neutral paper badge (documents, restaurants, …). */
export type BadgeTone = 'stay' | 'trans';

export interface ListRowProps {
  /** Leading badge content — an emoji/icon (content, not a UI control). */
  icon: ReactNode;
  badgeTone?: BadgeTone;
  /** Opens the row's primary target (a detail view / viewer). */
  onOpen: () => void;
  /** Accessible name for the open button (the row's title as a string). */
  openLabel: string;
  /** Disables the open button (e.g. a still-uploading document). */
  disabled?: boolean;
  /** The row's title line — may hold a lock chip, a type tag, a RouteLabel. */
  title: ReactNode;
  /** Optional secondary line (schedule cue, "not scheduled", …). */
  meta?: ReactNode;
  /** Trailing content before the kebab: code · size · spinner. */
  right?: ReactNode;
  /** Per-entity sync marker, rendered in a fixed column before the kebab so it
   *  aligns across every row type (ADR-0091 §alignment). Pass
   *  `<EntitySyncBadge id=… />`; it's silent when synced, so the column is often
   *  empty — its reserved width (list-row.css) keeps neighbours aligned. */
  sync?: ReactNode;
  /** Fades the row to read as provisional while a write is in transit (ADR-0092):
   *  the connected screen passes `useUnsynced(id)`. Pending only — a failed row
   *  stays full-opacity so its `cloud-bang` keeps drawing attention. */
  unsynced?: boolean;
  /** When set, renders the `⋯` kebab wired to open a RowManageSheet. */
  onManage?: () => void;
  /** Accessible name for the kebab (required when `onManage` is set). */
  manageLabel?: string;
  /** Extra modifier class on the row (e.g. a screen's `pending` state). */
  className?: string;
}

export function ListRow({
  icon,
  badgeTone,
  onOpen,
  openLabel,
  disabled,
  title,
  meta,
  right,
  sync,
  unsynced,
  onManage,
  manageLabel,
  className,
}: ListRowProps) {
  return (
    <div
      className={
        'wp-listrow' + (unsynced ? ' is-unsynced' : '') + (className ? ` ${className}` : '')
      }
    >
      <button
        type="button"
        className="wp-listrow-open"
        onClick={onOpen}
        disabled={disabled}
        aria-label={openLabel}
      >
        <span className={'wp-listrow-badge' + (badgeTone ? ` ${badgeTone}` : '')}>{icon}</span>
        <span className="wp-listrow-main">
          <span className="wp-listrow-title">{title}</span>
          {meta != null && <span className="wp-listrow-meta">{meta}</span>}
        </span>
      </button>
      {(right != null || onManage || sync != null) && (
        <div className="wp-listrow-right">
          {right}
          {sync != null && <span className="wp-listrow-sync">{sync}</span>}
          {onManage && (
            <button
              type="button"
              className="wp-listrow-kebab"
              onClick={onManage}
              aria-label={manageLabel}
            >
              {/* Not a nav arrow/caret — the lint-guarded glyph rule (design-language)
                  covers those, not the horizontal-ellipsis kebab. */}
              ⋯
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** One action in a RowManageSheet (edit / delete / …). */
export interface RowAction {
  label: string;
  /** Leading glyph (emoji content — ✏️ / 🗑️). */
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in the destructive (miss) color. */
  danger?: boolean;
}

/** The `⋯` menu a ListRow (or EventCard) opens: a bottom Sheet (the Modal
 *  primitive, so it carries the overlay-stack + focus contract) listing action
 *  items. Pass `title` for a visible header (the event menu shows the event
 *  title) or `ariaLabel` for a titleless menu (the Index/Documents row menus);
 *  one of the two is required. Multi-step flows (a delete/unlink prompt) keep
 *  their own sub-state and pass only the top-level menu here. */
export function RowManageSheet({
  title,
  ariaLabel,
  actions,
  onClose,
}: {
  title?: ReactNode;
  ariaLabel?: string;
  actions: RowAction[];
  onClose: () => void;
}) {
  return (
    <Sheet title={title} ariaLabel={ariaLabel} onClose={onClose}>
      <div className="wp-row-actions">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            className={'wp-row-action' + (a.danger ? ' danger' : '')}
            onClick={a.onSelect}
          >
            {a.icon != null && (
              <span className="wp-row-action-ic" aria-hidden="true">
                {a.icon}
              </span>
            )}
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
