// **What a sub-task may and may not carry** (ADR-0196 §1/§8), refused at the schema so both
// edges agree without either trusting the other.
//
// The refusal that pays for all the rest is the deadline: a step that cannot be dated cannot
// be urgent, cannot be overdue, and therefore has nothing to say on any surface ordered by
// urgency — which is what makes nineteen of the twenty-three task derivations correct about
// children *vacuously* rather than by remembering.
import { describe, it, expect } from 'vitest';
import { createTaskSchema, subtaskPatchRefuses, updateTaskSchema } from './schemas';

// **Ids are 8–64 chars** (`entityIdSchema`), and the first draft of this file used `'p'` and
// `'u1'` — so every case was refused for the wrong reason and the refusal assertions passed
// vacuously. The suite caught it because the ACCEPT cases were written beside them; without
// those, this file would have reported green about nothing.
const PARENT = 'parent-task-0001';
const MEMBER = 'member-user-0001';
const BOOKING = 'booking-row-0001';
const step = { title: 'להזמין מונית', parentTaskId: PARENT };

describe('creating a sub-task', () => {
  it('accepts a title and an assignee, which is all a step is', () => {
    expect(createTaskSchema.safeParse({ ...step, assigneeUserId: MEMBER }).success).toBe(true);
  });

  it('still accepts everything on a TOP-LEVEL task', () => {
    const root = { title: 'להזמין מסעדה', dueAt: '2026-08-20T18:00:00.000Z', important: true };
    expect(createTaskSchema.safeParse(root).success).toBe(true);
  });

  // **Depth is one level, and the schema owns only half of it.** A create carrying a parent is
  // valid here — whether that parent is ITSELF a step is a fact only the server can see, so
  // `TasksService.assertParent` refuses that direction. This asserts the half that lives here,
  // and names the half that does not, so nobody reads the green as covering both.
  it('accepts a parent id, and leaves the depth check to the server', () => {
    expect(createTaskSchema.safeParse(step).success).toBe(true);
  });

  it.each([
    ['a deadline', { dueAt: '2026-08-20T18:00:00.000Z' }],
    ['a wall-clock flag', { dueHasTime: true }],
    ['a pinned zone', { displayTimezone: 'Asia/Tokyo' }],
    ['an important flag', { important: true }],
    ['a body', { body: 'משהו' }],
    ['a derived key', { derivedKey: 'flights' }],
    ['a host', { bookingId: BOOKING }],
  ])('refuses %s on a step', (_label, extra) => {
    expect(createTaskSchema.safeParse({ ...step, ...extra }).success).toBe(false);
  });

  // `important: false` is not "an important flag" — a form that sends its defaults must not be
  // refused for the values it did not choose.
  it('is not tripped by a falsy value the form defaulted', () => {
    expect(createTaskSchema.safeParse({ ...step, important: false }).success).toBe(true);
  });
});

describe('patching a task', () => {
  // The update schema carries no `parentTaskId` at all: a step's parent is set at create and
  // never changes, so an editable field would be surface nothing sends.
  it('has no parent field to move a step with', () => {
    const parsed = updateTaskSchema.safeParse({ title: 'x', parentTaskId: PARENT });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'parentTaskId' in parsed.data).toBe(false);
  });

  // A sparse patch cannot say whether its target is a step, so the refusal is a predicate the
  // SERVER applies against the loaded row. This is that predicate.
  it('refuses a patch that would give a step what a step may not have', () => {
    expect(subtaskPatchRefuses({ dueAt: '2026-08-20T18:00:00.000Z' })).toBe(true);
    expect(subtaskPatchRefuses({ bookingId: BOOKING })).toBe(true);
    expect(subtaskPatchRefuses({ important: true })).toBe(true);
  });

  it('lets a step be renamed, reassigned and ticked', () => {
    expect(subtaskPatchRefuses({ title: 'שם חדש' })).toBe(false);
    expect(subtaskPatchRefuses({ assigneeUserId: MEMBER })).toBe(false);
    expect(subtaskPatchRefuses({ status: 'done' })).toBe(false);
  });

  // The tick sends `{ status }` alone; a refusal that read absent fields would break it.
  it('is not tripped by the fields a patch did not send', () => {
    expect(subtaskPatchRefuses({})).toBe(false);
    expect(subtaskPatchRefuses({ dueAt: null, bookingId: null })).toBe(false);
  });

  // The whole point of the id fixtures above: an accept case beside every refusal, so a
  // refusal cannot pass because the fixture was malformed.
  it('accepts what it should, with ids the schema recognises', () => {
    expect(createTaskSchema.safeParse({ ...step, assigneeUserId: MEMBER }).success).toBe(true);
  });
});
