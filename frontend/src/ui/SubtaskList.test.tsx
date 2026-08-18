// @vitest-environment jsdom
// **The authoring half** (ADR-0196 §10/§11): a step is created by typing and pressing Enter,
// renamed by tapping its words, assigned from the same row, and removed from it.
//
// The flow is what is tested rather than the markup, because the flow is the decision: Enter
// commits (the opposite of `NoteComposer`'s rule, on that rule's own reasoning), the box stays
// open for the next step, and the composer row IS the step's editor — which is what keeps the
// read row unchanged and `.note-item` a two-column grid.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { TASK_STATUS, TASK_SUBTASK_CAP, type Task, type User } from '@waypoint/shared';
import { SubtaskList, type SubtaskDraft } from './SubtaskList';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    members: [{ userId: 'u1' }],
    users: [{ id: 'u1', displayName: 'אסף', avatarHue: 'plum', avatarChoice: 'initials' }],
  }),
}));

const users = [
  { id: 'u1', displayName: 'אסף', avatarHue: 'plum', avatarChoice: 'initials' },
] as unknown as User[];

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

const show = (steps: Task[]) => {
  const on = {
    onAdd: vi.fn<(draft: SubtaskDraft) => void>(),
    onRename: vi.fn<(task: Task, draft: SubtaskDraft) => void>(),
    onTick: vi.fn<(task: Task) => void>(),
    onRemove: vi.fn<(task: Task) => void>(),
  };
  render(
    wrapNav(
      <SubtaskList
        steps={steps}
        users={users}
        open
        onAdd={on.onAdd}
        onRename={on.onRename}
        onTick={on.onTick}
        onRemove={on.onRemove}
      />,
    ),
  );
  return on;
};

// This suite renders in most of its cases and the config registers no auto-cleanup, so the
// DOM would otherwise accumulate and every `getBy*` would find the previous test's copy.
afterEach(cleanup);

const box = () => screen.getByLabelText(t.tasks.subtasks.add);
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const enter = () => fireEvent.keyDown(box(), { key: 'Enter' });

describe('adding a step', () => {
  it('commits on Enter and clears the box for the next one', () => {
    const on = show([]);
    type('להזמין מונית');
    enter();
    expect(on.onAdd).toHaveBeenCalledWith({ title: 'להזמין מונית', assigneeUserId: undefined });
    expect((box() as HTMLInputElement).value).toBe('');
  });

  it('trims, and refuses an empty step rather than writing a nameless one', () => {
    const on = show([]);
    type('   ');
    enter();
    expect(on.onAdd).not.toHaveBeenCalled();
  });

  // The composer is offered on a task with NO steps — otherwise nothing could get its first.
  it('is present before there is anything to add to', () => {
    show([]);
    expect(box()).toBeTruthy();
  });

  // The placeholder says what goes in the box, and says it differently once there is a list.
  it('asks for the first step, then for another', () => {
    const { rerender } = render(
      wrapNav(
        <SubtaskList
          steps={[]}
          users={users}
          open
          onAdd={vi.fn()}
          onRename={vi.fn()}
          onRemove={vi.fn()}
        />,
      ),
    );
    expect(box().getAttribute('placeholder')).toBe(t.tasks.subtasks.first);
    rerender(
      wrapNav(
        <SubtaskList
          steps={[step('s1')]}
          users={users}
          open
          onAdd={vi.fn()}
          onRename={vi.fn()}
          onRemove={vi.fn()}
        />,
      ),
    );
    expect(box().getAttribute('placeholder')).toBe(t.tasks.subtasks.another);
  });

  // Leaving the box with words in it commits them — `useNoteComposer().pending()`'s promise,
  // which is what makes Enter optional rather than mandatory.
  it('commits what is still typed when the box loses focus', () => {
    const on = show([]);
    type('לשלם על החניה');
    fireEvent.blur(box());
    expect(on.onAdd).toHaveBeenCalledWith({ title: 'לשלם על החניה', assigneeUserId: undefined });
  });

  it('refuses past the cap rather than writing silently', () => {
    const many = Array.from({ length: TASK_SUBTASK_CAP }, (_, i) => step(`s${i}`));
    const on = show(many);
    type('אחת יותר מדי');
    enter();
    expect(on.onAdd).not.toHaveBeenCalled();
    expect(screen.getByText(t.tasks.subtasks.full(TASK_SUBTASK_CAP))).toBeTruthy();
  });
});

describe('a step is edited in the composer, in its own place', () => {
  it('returns its words to the box when its words are tapped', () => {
    show([step('s1', { title: 'צק-אין' })]);
    fireEvent.click(screen.getByText('צק-אין'));
    expect((box() as HTMLInputElement).value).toBe('צק-אין');
  });

  it('renames rather than adding', () => {
    const on = show([step('s1', { title: 'צק-אין' })]);
    fireEvent.click(screen.getByText('צק-אין'));
    type('צק-אין אונליין');
    enter();
    expect(on.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), {
      title: 'צק-אין אונליין',
      assigneeUserId: undefined,
    });
    expect(on.onAdd).not.toHaveBeenCalled();
  });

  // A step being edited keeps its own tick: it is still a step, and a `＋` there would claim
  // the row is new.
  it('keeps the step’s tick while it is being edited', () => {
    show([step('s1', { title: 'צק-אין' })]);
    fireEvent.click(screen.getByText('צק-אין'));
    expect(screen.getByLabelText(t.tasks.tick('צק-אין'))).toBeTruthy();
  });

  it('removes the step from the same row, and only while one is being edited', () => {
    const on = show([step('s1', { title: 'צק-אין' })]);
    expect(screen.queryByLabelText(t.tasks.subtasks.remove)).toBeNull();
    fireEvent.click(screen.getByText('צק-אין'));
    fireEvent.click(screen.getByLabelText(t.tasks.subtasks.remove));
    expect(on.onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });
});

describe('a step reads as a step', () => {
  it('ticks through the same control the screen uses', () => {
    const on = show([step('s1', { title: 'להדפיס' })]);
    fireEvent.click(screen.getByLabelText(t.tasks.tick('להדפיס')));
    expect(on.onTick).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('strikes a settled step', () => {
    show([step('s1', { title: 'להדפיס', status: TASK_STATUS.DONE })]);
    expect(screen.getByText('להדפיס').closest('.note-item')?.className).toContain('tsk-settled');
  });

  // The face alone, and the name behind it — `Avatar`'s non-interactive form is `aria-hidden`,
  // so without the hidden span the row says nothing about who owes the step.
  it('says who owes it, for a reader who cannot see the face', () => {
    show([step('s1', { title: 'להדפיס', assigneeUserId: 'u1' })]);
    const row = screen.getByText('להדפיס').closest('.note-item') as HTMLElement;
    expect(within(row).getByText(`${t.tasks.sheet.assigneeLabel}: אסף`)).toBeTruthy();
  });

  it('says nothing about an owner when there is none', () => {
    show([step('s1', { title: 'להדפיס' })]);
    const row = screen.getByText('להדפיס').closest('.note-item') as HTMLElement;
    expect(within(row).queryByText(/אסף/)).toBeNull();
  });
});
