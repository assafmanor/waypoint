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
  onRemove,
  onClose,
}: {
  item: MaybeItem;
  /** Slot it onto a day — the verb the tile itself used to perform, now named. */
  onSchedule: () => void;
  /** Only where the host offers it: Plan mode's shelf, whose `✕` this mirrors. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { users } = useTrip();
  const author = users.find((u) => u.id === item.createdBy)?.displayName;

  const actions: RowAction[] = [
    { label: t.day.idea.schedule, icon: CONTROL_ICON.schedule, onSelect: onSchedule },
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
      <HostNotes
        host={{ kind: 'maybeItem', id: item.id, name: item.title, category: item.category }}
      />
    </RowManageSheet>
  );
}
