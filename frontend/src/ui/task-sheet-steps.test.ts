// **`ביטול` has to mean it, and a save has to say what changed** (ADR-0196 §12, amended
// 2026-08-19: _"edits to sub tasks take effect even if you canceled the edit … you might've
// removed a sub task when editing but then changed your mind and canceled, but the sub task
// was removed anyway"_).
//
// §12 wrote a step through the moment it was typed, so the editor's checklist was the one
// field in the sheet that `ביטול` did not undo. Staging it turns the save into a DIFF, and the
// diff is the part worth testing: what it writes, and — the half the report is about — what it
// does not.
import { describe, it, expect } from 'vitest';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { planSteps, type StepDraft } from './TaskSheet';

const step = (id: string, over: Partial<Task> = {}): Task =>
  ({
    id,
    tripId: 'trip',
    title: id,
    parentTaskId: 'p',
    dueHasTime: false,
    important: false,
    status: TASK_STATUS.OPEN,
    createdBy: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  }) as Task;

const draftOf = (task: Task): StepDraft => ({
  id: task.id,
  title: task.title,
  assigneeUserId: task.assigneeUserId,
  status: task.status,
});

describe('planSteps', () => {
  const before = [step('s1'), step('s2')];

  it('writes nothing at all when nothing was touched', () => {
    expect(planSteps(before, before.map(draftOf))).toEqual({ add: [], edit: [], drop: [] });
  });

  it('drops a step that was taken out of the list', () => {
    expect(planSteps(before, [draftOf(before[0])]).drop).toEqual(['s2']);
  });

  it('adds a step typed in this session, with no id to send', () => {
    const plan = planSteps(before, [...before.map(draftOf), { title: 'נעליים' }]);
    expect(plan.add).toEqual([{ title: 'נעליים', assigneeUserId: undefined }]);
    expect(plan.edit).toEqual([]);
  });

  it('sends only the keys that changed', () => {
    const renamed = [{ ...draftOf(before[0]), title: 'מטענים' }, draftOf(before[1])];
    expect(planSteps(before, renamed).edit).toEqual([{ id: 's1', patch: { title: 'מטענים' } }]);
  });

  // `null` clears and `undefined` leaves alone — `updateTaskSchema`'s grammar, and the
  // difference between un-assigning a step and not touching who owes it.
  it('clears an assignee with null rather than leaving it alone', () => {
    const owned = [step('s1', { assigneeUserId: 'u2' })];
    const freed = [{ ...draftOf(owned[0]), assigneeUserId: undefined }];
    expect(planSteps(owned, freed).edit).toEqual([{ id: 's1', patch: { assigneeUserId: null } }]);
  });

  it('carries a tick, because a tick in the sheet is staged too', () => {
    const ticked = [{ ...draftOf(before[0]), status: TASK_STATUS.DONE }, draftOf(before[1])];
    expect(planSteps(before, ticked).edit).toEqual([
      { id: 's1', patch: { status: TASK_STATUS.DONE } },
    ]);
  });

  it('handles a remove and an add in one save', () => {
    const plan = planSteps(before, [draftOf(before[1]), { title: 'כלי רחצה' }]);
    expect(plan.drop).toEqual(['s1']);
    expect(plan.add).toEqual([{ title: 'כלי רחצה', assigneeUserId: undefined }]);
  });

  // A reassignment is the OTHER report from the same message, and it has to survive the diff
  // as a patch rather than as a remove-and-add.
  it('reassigns in place rather than replacing the step', () => {
    const owned = [step('s1', { assigneeUserId: 'u2' })];
    const moved = [{ ...draftOf(owned[0]), assigneeUserId: 'u3' }];
    const plan = planSteps(owned, moved);
    expect(plan).toEqual({
      add: [],
      edit: [{ id: 's1', patch: { assigneeUserId: 'u3' } }],
      drop: [],
    });
  });
});
