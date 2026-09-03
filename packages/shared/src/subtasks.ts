// **What "settled" means, and how a parent gets its status from its steps** (ADR-0196 §2).
//
// Moved out of `frontend/src/lib/tasks.ts` for the reason `task-time.ts` next door states,
// applied one level up. That file's header says the sub-task tree "stays on the frontend,
// because no server surface asks those questions" — and then one did. The notification sweep
// reads a task's STORED `status`, a parent's stored status is never written (that is §2's
// whole design, and it is right), so a checklist whose every step was ticked still read
// `open` on the server and the 08:00 digest named it every morning, forever. Reported from
// the phone: *"sends notifications about tasks that were already completed"*.
//
// So the derivation travels instead of the state. One function, two readers — the same rule
// ADR-0197 §5 applies to clocks, applied to a status.
import { TASK_STATUS } from './constants';
import type { TaskStatus } from './entities';

/** **Settled = a person answered**, stated as what settled IS rather than as `!== OPEN`.
 *
 *  The two forms are identical for a well-formed row — there are three statuses — and part
 *  company on a row carrying none, which is what a peer's create used to deliver
 *  (ADR-0196's 2026-08-19 defect: `undefined` answered "settled" at twenty-two call sites at
 *  once). A row we cannot read is work still to do, never work quietly marked finished. */
export const isSettled = (task: { status: TaskStatus }): boolean =>
  task.status === TASK_STATUS.DONE || task.status === TASK_STATUS.DISMISSED;

/** **A parent's status is DERIVED from its steps, and nothing is written** (ADR-0196 §2).
 *
 *  - `dismissed` is a human decision no derivation can produce ("this whole thing is off"),
 *    so it is stored and it wins.
 *  - Otherwise a parent is `done` exactly when every step is settled, and `open` otherwise.
 *    A stored `done` on a row that later gains a step is therefore **ignored rather than
 *    repaired**: no migration, no write, no window where the two disagree.
 *  - No steps means no derivation: the row's own status answers, which is every task in the
 *    app that is not a checklist.
 *
 *  Takes the statuses alone rather than whole `Task`s, so the server can answer it from two
 *  columns instead of loading a checklist's worth of rows it will not read. */
export function resolveParentStatus(
  parent: { status: TaskStatus },
  steps: readonly { status: TaskStatus }[],
): TaskStatus {
  if (steps.length === 0) return parent.status;
  if (parent.status === TASK_STATUS.DISMISSED) return parent.status;
  return steps.every(isSettled) ? TASK_STATUS.DONE : TASK_STATUS.OPEN;
}
