// **A readiness check, rendered as a task row** (ADR-0188 §4/§7, ADR-0190). One component,
// both hosts — the tasks screen and Plan Home — because ADR-0188 §6's whole finding was that
// `.chk-row` was `ListRow` written a second time, and building a second automatic row here
// would repeat the mistake it retired.
//
// **The leading element says who owns the outcome** (§4). A manual task leads with a tick,
// because you close it; an automatic task leads with the derivation's own badge, because the
// data closes it. Under the literal "they look the same" reading, three of five rows would
// carry a circle nobody can press — which is not a behaviour, it is the definition of
// reading as a bug.
//
// **No CTA button and no sync column** (§7). `ListRow` has a tap where `.chk-row` was a
// `<div>` and needed an explicit button, so the row's own tap fires the verb and ADR-0061
// §1's rule survives without one; and until somebody dismisses, assigns or flags a check it
// has no row at all, so there is no write in flight to badge.
import type { AutomaticTask } from '../lib/automatic-tasks';
import { ListRow } from './domain';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './tasks.css';

export function AutomaticTaskRow({
  auto,
  onAct,
  onManage,
}: {
  auto: AutomaticTask;
  /** The check's one verb. The row's tap fires it, and the `⋯`'s first item names it. */
  onAct: () => void;
  onManage: () => void;
}) {
  return (
    <ListRow
      className="tsk-auto"
      icon={<Icon name={auto.icon} />}
      onOpen={onAct}
      openLabel={auto.title}
      title={<span>{auto.title}</span>}
      meta={auto.meta}
      // `.chk-ok` is the one `.chk-*` that survives the retirement — the exact element Plan
      // Home's completed checklist row already rendered, now in `ListRow`'s trailing slot.
      right={
        auto.done ? (
          <span className="chk-ok">
            <Icon name="check" /> {t.planHome.checklist.done}
          </span>
        ) : undefined
      }
      onManage={onManage}
      manageLabel={t.tasks.manage.actions}
    />
  );
}
