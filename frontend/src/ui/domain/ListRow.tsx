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
import { Icon, type IconName } from '../Icon';
import { PlaceBadge } from './PlaceBadge';
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
  /** Show this row's place on our map (ADR-0121 §8). Set only where the row's
   *  entity resolves a coord-bearing place — a documents row never does, and a
   *  booking with no place (or a coordless one) has nothing to focus, so the
   *  control is simply absent. It rides the row's BADGE (`PlaceBadge`) rather than
   *  adding a trailing control, which measured badly: the row has no width to give. */
  onShowOnMap?: () => void;
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
  onShowOnMap,
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
        <PlaceBadge
          className={'wp-listrow-badge' + (badgeTone ? ` ${badgeTone}` : '')}
          onShowOnMap={onShowOnMap}
        >
          {icon}
        </PlaceBadge>
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
              <Icon name="more" />
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
  /** Leading mark. An `IconName`, never a glyph: a menu item is a control, and
   *  "emoji are content, icons are UI" (design-language, ADR-0138). Typing it
   *  this way is what makes the rule un-bypassable here — the four call sites
   *  that passed `'✏️'` as a literal no longer compile. Omit it only for a verb
   *  whose shape is genuinely undecided. */
  icon?: IconName;
  onSelect: () => void;
  /** Groups the action into the sheet's trailing destructive partition. */
  danger?: boolean;
}

/** The `⋯` menu a ListRow (or EventCard) opens: a bottom Sheet (the Modal
 *  primitive, so it carries the overlay-stack + focus contract) listing action
 *  items.
 *
 *  **It always names its subject** (ADR-0138 §3). `title` is required — the
 *  booking and document menus used to pass only an `ariaLabel`, which left two
 *  anonymous rows floating over a scrim with the thing you were deleting hidden
 *  behind it. `subject` is the quiet fact line under the title (a type, a time,
 *  a state), written in the app's `·` grammar so the sheet reads as the row it
 *  came from. A numeric run inside it needs `ltrIsolate` (ADR-0118).
 *
 *  **Destructive actions partition rather than recolour.** `danger` items are
 *  collected into a second group below a hairline instead of sitting flush in
 *  the stack tinted red — the one item in a thumb-reach list you must not hit by
 *  accident had been distinguished by text hue alone.
 *
 *  Multi-step flows (a delete/unlink prompt, the `הזז` position step) keep their
 *  own sub-state and pass only the top-level menu here. */
export function RowManageSheet({
  title,
  subject,
  actions,
  onClose,
}: {
  title: ReactNode;
  subject?: ReactNode;
  actions: RowAction[];
  onClose: () => void;
}) {
  return (
    <Sheet
      title={
        <>
          {title}
          {subject != null && <span className="wp-row-subject">{subject}</span>}
        </>
      }
      onClose={onClose}
    >
      <RowActionList actions={actions} />
    </Sheet>
  );
}

/** The action list on its own, for a sheet that owns a different header or a
 *  second step: `MemberSheet` (an identity header above its verbs) and the Plan
 *  builder's menu (a `הזז` step below them). Same markup, same partition — the
 *  point is that there is exactly one of it (ADR-0138 §1; before this, the same
 *  rows existed as `.wp-row-action`, `screens.css`'s `.row-action`, and
 *  `.ms-act`). */
export function RowActionList({ actions }: { actions: RowAction[] }) {
  const item = (a: RowAction, i: number) => (
    <button
      key={i}
      type="button"
      className={'wp-row-action' + (a.danger ? ' danger' : '')}
      onClick={a.onSelect}
    >
      {a.icon && (
        <span className="wp-row-action-ic" aria-hidden="true">
          <Icon name={a.icon} />
        </span>
      )}
      {a.label}
    </button>
  );
  const safe = actions.filter((a) => !a.danger);
  const danger = actions.filter((a) => a.danger);

  return (
    <>
      <div className="wp-row-actions">{safe.map(item)}</div>
      {danger.length > 0 && (
        <div className="wp-row-actions wp-row-actions-danger">{danger.map(item)}</div>
      )}
    </>
  );
}
