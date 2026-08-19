// **The boundary, the derived parent, and the one derivation the boundary does not answer**
// (ADR-0196 §2 and its audit).
//
// This file's subject is the claim the whole feature rests on: children are split off ONCE, so
// the twenty-odd derivations in `lib/tasks.ts` are correct about them without knowing they
// exist. That claim is only worth as much as the boundary is airtight, so what is tested here
// is the split itself, the status it resolves, the cascade, and `שלי` — the single place the
// split is not the whole answer.
import { describe, it, expect } from 'vitest';
import { CHANGE_ACTION, ENTITY_TYPE, TASK_STATUS, type Task } from '@waypoint/shared';
import {
  dropTasksForHostChange,
  isSubtask,
  splitSubtasks,
  subtaskProgress,
  TASK_FACET,
  taskMatchesFacet,
} from './tasks';

const task = (over: Partial<Task> & { id: string }): Task => ({
  tripId: 'trip',
  title: over.id,
  dueHasTime: false,
  important: false,
  status: TASK_STATUS.OPEN,
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u1',
  ...over,
});

const parent = task({ id: 'p' });
const step = (id: string, over: Partial<Task> = {}) => task({ id, parentTaskId: 'p', ...over });
const done = (id: string, over: Partial<Task> = {}) =>
  step(id, { status: TASK_STATUS.DONE, settledAt: '2026-08-02T10:00:00.000Z', ...over });

describe('splitSubtasks — the exclusion, paid once', () => {
  it('keeps children out of the roots and files them under their parent', () => {
    const { roots, byParent } = splitSubtasks([parent, step('s1'), step('s2'), task({ id: 'x' })]);
    expect(roots.map((r) => r.id)).toEqual(['p', 'x']);
    expect(byParent.get('p')?.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('preserves creation order for the steps — a checklist is authored, not ranked', () => {
    const { byParent } = splitSubtasks([parent, step('s2'), step('s1')]);
    expect(byParent.get('p')?.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('leaves a task with no steps exactly as it was', () => {
    const [root] = splitSubtasks([parent]).roots;
    expect(root).toEqual(parent);
  });

  // The whole point of the boundary: a surface that iterates `roots` cannot see a step, so it
  // cannot count one, sort one, or put one in a band. No per-derivation guard required.
  it('hands a step to nothing that iterates roots', () => {
    const { roots } = splitSubtasks([parent, step('s1'), step('s2')]);
    expect(roots.some(isSubtask)).toBe(false);
  });
});

describe("a parent's status is derived, never stored", () => {
  it('is open while any step is open', () => {
    const [root] = splitSubtasks([parent, done('s1'), step('s2')]).roots;
    expect(root.status).toBe(TASK_STATUS.OPEN);
  });

  it('is done when every step is settled, and carries the last settlement', () => {
    const [root] = splitSubtasks([
      parent,
      done('s1', { settledAt: '2026-08-02T09:00:00.000Z', settledBy: 'u1' }),
      done('s2', { settledAt: '2026-08-02T11:00:00.000Z', settledBy: 'u2' }),
    ]).roots;
    expect(root.status).toBe(TASK_STATUS.DONE);
    expect(root.settledBy).toBe('u2');
  });

  // The cost the ADR chose derived over stored to avoid: a `done` written before the task had
  // steps cannot survive gaining one, because nothing reads it.
  it('IGNORES a stored done once there are steps — nothing can go stale', () => {
    const stale = task({ id: 'p', status: TASK_STATUS.DONE });
    const [root] = splitSubtasks([stale, step('s1')]).roots;
    expect(root.status).toBe(TASK_STATUS.OPEN);
  });

  // The one human answer no derivation can produce, and the predicate `automatic-tasks.ts`
  // already ships: the derivation answers UNLESS the row says dismissed.
  it('lets a stored `dismissed` win over the steps', () => {
    const off = task({ id: 'p', status: TASK_STATUS.DISMISSED });
    const [root] = splitSubtasks([off, step('s1')]).roots;
    expect(root.status).toBe(TASK_STATUS.DISMISSED);
  });
});

describe('subtaskProgress', () => {
  it('counts the settled steps against the total', () => {
    expect(subtaskProgress([done('s1'), step('s2'), step('s3')])).toEqual({ done: 1, total: 3 });
  });

  // `total: 0` is what every surface tests instead of a stored "is this a checklist" flag,
  // so it has to be what a task with no steps reports.
  it('reports total 0 for a task that is not a parent', () => {
    expect(subtaskProgress(undefined)).toEqual({ done: 0, total: 0 });
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('שלי — the one place the boundary is not the whole answer', () => {
  const mine = 'me';
  const byParent = new Map([['p', [step('s1', { assigneeUserId: mine })]]]);

  it('matches an unassigned parent whose STEP is mine', () => {
    expect(taskMatchesFacet(parent, TASK_FACET.MINE, mine, byParent)).toBe(true);
  });

  // Without this, the one filter whose entire job is "what do I owe" hides work from the
  // person doing the filtering.
  it('does NOT match it when the child index is withheld', () => {
    expect(taskMatchesFacet(parent, TASK_FACET.MINE, mine)).toBe(false);
  });

  it('ignores a step of mine that is already settled', () => {
    const settled = new Map([['p', [done('s1', { assigneeUserId: mine })]]]);
    expect(taskMatchesFacet(parent, TASK_FACET.MINE, mine, settled)).toBe(false);
  });

  it('still matches on the parent’s own assignee', () => {
    const owned = task({ id: 'p', assigneeUserId: mine });
    expect(taskMatchesFacet(owned, TASK_FACET.MINE, mine, new Map())).toBe(true);
  });
});

describe('a deleted parent takes its steps with it, in the client', () => {
  const rows = [parent, step('s1'), step('s2'), task({ id: 'other' })];

  // The DB cascade removes them server-side and writes NO `Change` rows for them, so without
  // this they sit orphaned in memory and in Dexie until the next cold sync.
  it('drops the steps when their parent is deleted', () => {
    const next = dropTasksForHostChange(rows, {
      action: CHANGE_ACTION.DELETE,
      entityType: ENTITY_TYPE.TASK,
      entityId: 'p',
    });
    expect(next.map((r) => r.id)).toEqual(['p', 'other']);
  });

  it('leaves everything alone for an unrelated task delete', () => {
    const next = dropTasksForHostChange(rows, {
      action: CHANGE_ACTION.DELETE,
      entityType: ENTITY_TYPE.TASK,
      entityId: 'other',
    });
    expect(next).toBe(rows);
  });

  it('leaves everything alone for a task UPDATE', () => {
    const next = dropTasksForHostChange(rows, {
      action: CHANGE_ACTION.UPDATE,
      entityType: ENTITY_TYPE.TASK,
      entityId: 'p',
    });
    expect(next).toBe(rows);
  });

  // The host cascade it wraps is untouched: a deleted EVENT still drops the tasks hung on it.
  it('still drops a deleted host’s tasks', () => {
    const hosted = [task({ id: 'a', eventId: 'e1' }), task({ id: 'b' })];
    const next = dropTasksForHostChange(hosted, {
      action: CHANGE_ACTION.DELETE,
      entityType: ENTITY_TYPE.EVENT,
      entityId: 'e1',
    });
    expect(next.map((r) => r.id)).toEqual(['b']);
  });
});
