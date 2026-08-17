// **A readiness check, rendered as a task row** (ADR-0188 §4 as amended 2026-08-16,
// ADR-0190). One component, both hosts — the tasks screen and Plan Home — because ADR-0188
// §6's whole finding was that `.chk-row` was `ListRow` written a second time, and building a
// second automatic row here would repeat the mistake it retired.
//
// **The tick is the SAME control a manual task carries, and it works** (owner, 2026-08-16:
// _"makes no sense that the indication for a complete task is different for automatic and
// manual tasks. Both should look (and behave!) the same"_).
//
// This reverses ADR-0188 §4's leading element. That section gave a check the derivation's
// badge *because* its done-ness could not be pressed — "three inert circles out of five",
// which reads as a bug rather than a behaviour. The owner took the other way out of the same
// corner: make the circle work. There is then nothing inert to explain, and brief §2's "one
// noun, one row shape" holds all the way down to the control — which is what it always said
// and what §4 had to carve an exception out of.
//
// **And it carries NO BADGE** (owner, 2026-08-16: _"we don't want both an icon and a done
// tick circle"_). Two reasons, and the first is the one that decides it:
//
// The badge RESTATED THE TITLE. The rows read `טיסות` beside a plane, `לינה` beside a bed,
// `מסמכים ודרכונים` beside a passport — the same sentence twice, six pixels apart. A booking
// row's badge earns its slot because the row's words are a hotel's NAME and the badge is what
// KIND it is; a check's words are already its kind.
//
// And it settles a thing ADR-0188 §1 found and then walked back: "the brief's §5 is right
// that a task has no icon slot to fill". A manual task has no badge, so a badge here was the
// last difference at the LEADING edge — and after the tick became the same control, the two
// kinds now open identically, which is what brief §2 claimed and what §4 had to carve an
// exception out of.
//
// **They are not pixel-identical, and the remaining difference is deliberate:** a manual row
// reserves the sync column and a check does not (§7 — a check has no row until somebody
// touches it, so there is no write to badge). Measured at 360: the title column is 286px
// here against a manual row's 259px, the difference being that reserved column at the
// trailing edge rather than anything at the leading one.
//
// **Still no sync column** (§7): until somebody ticks, dismisses, assigns or flags a check it
// has no row at all, so there is nothing in flight to badge. The tick is now one of the acts
// that mints one.
import type { AutomaticTask } from '../lib/automatic-tasks';
import { ListRow } from './domain';
import { TaskTick } from './TaskTick';
import { t } from '../i18n/he';
import './tasks.css';

export function AutomaticTaskRow({
  auto,
  onTick,
  onAct,
  onManage,
}: {
  auto: AutomaticTask;
  /** Complete ⇄ uncomplete, the same verb the manual tick fires. */
  onTick: () => void;
  /** The check's one resolving verb — the row's tap, and the `⋯`'s first item. */
  onAct: () => void;
  onManage: () => void;
}) {
  return (
    <ListRow
      className={auto.done ? 'tsk-auto tsk-settled' : 'tsk-auto'}
      lead={<TaskTick done={auto.done} title={auto.title} onTick={onTick} />}
      onOpen={onAct}
      openLabel={auto.title}
      title={<span>{auto.title}</span>}
      meta={auto.meta}
      onManage={onManage}
      manageLabel={t.tasks.manage.actions}
    />
  );
}
