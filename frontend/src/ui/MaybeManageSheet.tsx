// **The surface an idea never had** (ADR-0116's 2026-08-01 amendment, ADR-0153 §8).
//
// Every other note host has somewhere that says "here is this thing": a booking has its
// detail sheet, a document its manage sheet, an event and a place their own surfaces. An
// idea had a 140×76 tile and a schedule form, and a note section above a scheduling flow is
// the wrong room — so the tile's tap now opens this, with `שיבוץ ליום` as the first action.
//
// It is a `RowManageSheet` and not a new overlay: this is the one surface a row's actions
// belong on (ADR-0138 §1), and the idea's scattered verbs — a tap that scheduled, a
// Plan-only `✕` — are collected onto it for the first time.
//
// **What it deliberately does not offer is `עריכה`.** The mockup drew it, and the app has no
// idea-edit surface to open; inventing a form here would be a second decision smuggled in
// behind a gesture change. `הסרה` appears only where the host already allowed it (Plan's
// `✕`), so the capability boundary ADR-0116 §4 drew is untouched.
import type { MaybeItem } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { RowManageSheet, type RowAction } from './domain';
import { HostNotes } from './HostNotes';
import { CONTROL_ICON } from '../constants';
import { t } from '../i18n/he';

export function MaybeManageSheet({
  item,
  onSchedule,
  markForDay,
  why,
  onRemove,
  onClose,
}: {
  item: MaybeItem;
  /** Slot it onto a day — the verb the tile itself used to perform, now named. */
  onSchedule: () => void;
  /** **Agreeing with a `fits-a-day` proposal** (ADR-0151's 2026-08-04 amendment): the day the
   *  suggestion named, already in words, and what to do about it. Absent unless this idea
   *  carries that reason — the verb exists only where there is a proposal to agree with.
   *
   *  The tile does not offer it, deliberately: session 203 took the per-card `＋ שבץ ליום` out
   *  precisely because the tile's height came out of it, so an idea's verbs live one tap in. */
  markForDay?: { label: string; onSelect: () => void };
  /** **Why this idea sits where it does, in full** (ADR-0151 §8, and its 2026-08-04 amendment):
   *  the tile's meta line drops the stop name because it wraps and costs the tile 8px, so the
   *  whole sentence is said here, which is the room it was measured out of. Already rendered by
   *  the host (`reasonText`) — copy is not this component's to compose. */
  why?: string;
  /** Only where the host offers it: Plan mode's shelf, whose `✕` this mirrors. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { users } = useTrip();
  const author = users.find((u) => u.id === item.createdBy)?.displayName;

  const actions: RowAction[] = [
    { label: t.day.idea.schedule, icon: CONTROL_ICON.schedule, onSelect: onSchedule },
    // A tick, not a second calendar. The first draft gave the two rows a calendar and a clock,
    // which is exactly the collision ADR-0161 §7 was written about: when two rows reach for one
    // glyph, one of them has not been thought about.
    ...(markForDay
      ? [{ label: markForDay.label, icon: CONTROL_ICON.done, onSelect: markForDay.onSelect }]
      : []),
    ...(onRemove
      ? [{ label: t.day.idea.remove, icon: CONTROL_ICON.trash, danger: true, onSelect: onRemove }]
      : []),
  ];

  return (
    <RowManageSheet
      title={item.title}
      // It names its subject like every other row menu (ADR-0138 §3) — and here the author
      // is the fact worth carrying: an idea on a shared shelf is somebody's.
      subject={t.day.idea.subject(author)}
      actions={actions}
      onClose={onClose}
    >
      {why && <div className="idea-why">{why}</div>}
      <HostNotes
        host={{ kind: 'maybeItem', id: item.id, name: item.title, category: item.category }}
      />
    </RowManageSheet>
  );
}
