import { describe, expect, it } from 'vitest';
import { assignmentStamp } from './tasks.service';

/**
 * `assignmentStamp` is the whole of `task.assigned`'s trigger, and it is pure — so it gets a
 * unit spec of its own rather than only indirect coverage through `tasks.service.spec.ts`,
 * which needs a Postgres and therefore does not run everywhere this does.
 *
 * The rule it encodes: **the send is derived, but the transition has to be recorded**, and
 * "the actor is not the assignee" is applied HERE, where the actor is actually known, instead
 * of being guessed by the sweep from `updatedBy` (ADR-0198 §2).
 */
describe('assignmentStamp', () => {
  const ACTOR = 'u-dana';

  it('stamps now when somebody else is put on the task', () => {
    const { assignedAt } = assignmentStamp(null, 'u-noam', ACTOR);
    expect(assignedAt).toBeInstanceOf(Date);
  });

  it('leaves the column ALONE when the patch does not touch the assignee', () => {
    // The case the whole column exists for: an edit to the title must not re-announce an
    // assignment somebody already heard about. An empty object is what Prisma omits.
    expect(assignmentStamp('u-noam', undefined, ACTOR)).toEqual({});
  });

  it('leaves it alone when the assignee is re-sent unchanged', () => {
    // A sparse patch that happens to carry the same assignee (the editor sends the whole
    // form) is not a new assignment.
    expect(assignmentStamp('u-noam', 'u-noam', ACTOR)).toEqual({});
  });

  it('CLEARS it on a self-assignment', () => {
    // Nothing to tell anybody, and this is where ADR-0198's "when the actor is not the
    // assignee" rule is actually enforced. Clearing rather than leaving alone matters:
    // taking a task off somebody and onto yourself must not leave their send armed.
    expect(assignmentStamp('u-noam', ACTOR, ACTOR)).toEqual({ assignedAt: null });
  });

  it('CLEARS it on un-assign, which retracts a send that has not gone out', () => {
    expect(assignmentStamp('u-noam', null, ACTOR)).toEqual({ assignedAt: null });
  });

  it('re-stamps when a task moves from one person to another', () => {
    const { assignedAt } = assignmentStamp('u-noam', 'u-maor', ACTOR);
    expect(assignedAt).toBeInstanceOf(Date);
  });

  it('stamps a create that arrives already assigned to somebody else', () => {
    const { assignedAt } = assignmentStamp(null, 'u-noam', ACTOR);
    expect(assignedAt).toBeInstanceOf(Date);
  });

  it('does not stamp a create the author assigned to themselves', () => {
    expect(assignmentStamp(null, ACTOR, ACTOR)).toEqual({ assignedAt: null });
  });

  it('does not stamp a create with no assignee at all', () => {
    // A group task ("one of us") is not addressed to anyone, so nobody is told they were
    // given it — `task.due` reaches the whole group at the deadline instead.
    expect(assignmentStamp(null, undefined, ACTOR)).toEqual({});
  });
});
