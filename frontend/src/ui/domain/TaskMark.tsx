// **The mark a host's row carries when something is still to be DONE about it** (tasks brief
// §F, ADR-0191). `NoteMark`'s exact box, count rule and a11y contract — and copying those
// rather than re-deciding them is `DocumentMark`'s own stated reason: one shape everywhere,
// and a second set of numbers on a line that already carries two would read as two systems.
//
// **Three marks and not one combined glyph**, on that same reasoning extended: a note is
// something a person WROTE, a document is a file you may have to SHOW AT A BORDER, a task is
// something still OWED. One glyph cannot say which of the three a tap will get you.
//
// **A checkbox, not the bare `check` the tick uses** (ADR-0191 §1). Tasks' silhouette is
// `check` and `NoteMark`'s rule is one silhouette per noun — but since the automatic row lost
// its badge, a `check` on a task row means the completion control and nothing else, so a bare
// ✓ on a booking row reads "this is done" rather than "there is a task here". Measured: the
// checkbox and the bare ✓ cost identically (0px of row height, 0px of baseline offset), so
// the measurement does not decide between them and the reading does.
//
// **It counts OPEN tasks only** (§2), which is the one place this parts company with the two
// marks beside it. A note and a document have no lifecycle; a task does, and a row still
// marked after the task closed is a nag with nothing behind it. The trace is not lost — it is
// on the task, which stays under `הושלמו`.
//
// A **read-only indicator**, not a tap target, on ADR-0152 §8's argument unchanged: ~16px
// against a 44px floor, and widening it would put it in competition with opening the row it
// sits in.
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import '../tasks.css';

export function TaskMark({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  const label = t.tasks.mark(count);
  return (
    <span
      className={'tsk-mark' + (className ? ` ${className}` : '')}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name="checkbox" />
      {count > 1 ? count : ''}
    </span>
  );
}
