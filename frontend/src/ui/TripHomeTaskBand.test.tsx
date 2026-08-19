// @vitest-environment jsdom
// The Trip Home band (ADR-0188 §6): the cap, the overflow row, and the absence.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TASK_STATUS, type Task, type User } from '@waypoint/shared';
import { TripHomeTaskBand } from './TripHomeTaskBand';
import { TRIP_HOME_TASK_BAND_CAP } from '../constants';
import type { TaskClock } from '../lib/tasks';
import { t } from '../i18n/he';

const CLOCK: TaskClock = {
  nowMs: Date.parse('2026-08-15T09:00:00.000Z'),
  crossings: [],
  primaryZone: 'Asia/Jerusalem',
};

const users: User[] = [
  {
    id: 'u1',
    email: 'a@b.c',
    displayName: 'אסף',
    avatarHue: 'plum',
    avatarChoice: 'initials',
    googleAvatarUrl: null,
    uploadedAvatarUrl: null,
    preferredCurrency: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  tripId: 't1',
  title: id,
  dueAt: '2026-08-15T15:00:00.000Z',
  dueHasTime: true,
  important: false,
  status: TASK_STATUS.OPEN,
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u1',
  ...over,
});

const show = (
  due: Task[],
  handlers: Partial<Record<string, () => void>> = {},
  subtasks: Map<string, Task[]> = new Map(),
) =>
  render(
    <TripHomeTaskBand
      due={due}
      users={users}
      subtasks={subtasks}
      clock={CLOCK}
      onTick={handlers.onTick ?? (() => {})}
      onOpen={handlers.onOpen ?? (() => {})}
      onSeeAll={handlers.onSeeAll ?? (() => {})}
    />,
  );

afterEach(cleanup);

describe('TripHomeTaskBand', () => {
  // ADR-0045's no-empty-shell rule: the section is ABSENT, not empty.
  it('renders nothing at all when nothing is due', () => {
    const { container } = show([]);
    expect(container.innerHTML).toBe('');
  });

  it('caps the rows and offers the rest as one more row in the same card', () => {
    const many = Array.from({ length: TRIP_HOME_TASK_BAND_CAP + 2 }, (_, i) => task(`t${i}`));
    show(many);
    expect(document.querySelectorAll('.checklist .wp-listrow')).toHaveLength(
      TRIP_HOME_TASK_BAND_CAP,
    );
    const more = document.querySelector('.tsk-more')!;
    expect(more).toBeTruthy();
    expect(more.textContent).toContain(t.tasks.band.more(2));
    // Inside the card, not beside it — that is what "one more row" means.
    expect(more.closest('.checklist')).toBeTruthy();
  });

  it('offers no overflow row when everything fits', () => {
    show([task('a'), task('b')]);
    expect(document.querySelector('.tsk-more')).toBeNull();
  });

  it('counts the overdue ones in the section title, and only when some are', () => {
    show([task('late', { dueAt: '2026-08-14T09:00:00.000Z' }), task('now')]);
    expect(screen.getByText(t.tasks.band.overdue(1))).toBeTruthy();
    cleanup();
    show([task('now')]);
    expect(screen.queryByText(t.tasks.band.overdue(1))).toBeNull();
  });

  it('fires the tick and the two ways through to the screen', () => {
    const onTick = vi.fn();
    const onOpen = vi.fn();
    const onSeeAll = vi.fn();
    const many = Array.from({ length: TRIP_HOME_TASK_BAND_CAP + 1 }, (_, i) => task(`t${i}`));
    show(many, { onTick, onOpen, onSeeAll });
    fireEvent.click(document.querySelector('.tsk-tick')!);
    expect(onTick).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.wp-listrow-open')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.tsk-more')!);
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  // **THE ASSIGNEE IS A FACE ON THE TITLE ROW** (ADR-0190 §6's amendment, which reached
  // `IndexTasksView` in that round and this row only on 2026-08-16 — owner: the assignee on
  // Plan Home _"should look like it is in the task screen"_).
  //
  // These two tests replace ones that pinned the PRE-amendment shape (an avatar plus a name
  // in the meta line, behind a `·`). What that cost is the thing that was reported: the meta
  // carried a deadline AND a name, so it wrapped and the assignee landed on a third line —
  // the same task rendering 22px taller than itself one tab over.
  it('puts the face on the title row, not in the meta line', () => {
    show([task('a', { assigneeUserId: 'u1' })]);
    const title = document.querySelector('.wp-listrow-title')!;
    expect(title.querySelector('.tsk-who-row')).toBeTruthy();
    // `.tsk-assignee` was the meta-line wrapper and `.tsk-who` is the EDITOR's density
    // wrapper, which carries a 38px avatar rule (`tasks-avatar-size.test.ts`). Neither
    // belongs on this row.
    expect(document.querySelector('.tsk-assignee')).toBeNull();
    expect(document.querySelector('.tsk-who')).toBeNull();
  });

  // `Avatar`'s non-interactive form is `aria-hidden`, so dropping the visible name would
  // leave the row saying nothing at all about who owes it unless the name is said elsewhere.
  it('still announces who owes it, though the name is no longer drawn', () => {
    show([task('mine', { assigneeUserId: 'u1' })]);
    expect(screen.queryByText('אסף')).toBeNull();
    expect(screen.getByText(`${t.tasks.sheet.assigneeLabel}: אסף`)).toBeTruthy();
  });

  // **The empty slot is the statement** (§6's own reasoning): in a fixed position at the end
  // of the title row, absence is unambiguous — there is a place for a face and no face in it
  // — so `לא משויך` stops being needed to tell "nobody" from "a name that did not fit".
  it('draws nothing at all when nobody owes it', () => {
    show([task('nobody')]);
    expect(document.querySelector('.tsk-who-row')).toBeNull();
    expect(screen.queryByText(t.tasks.sheet.nobody)).toBeNull();
  });

  // **A settled task draws a TICKED circle** (owner, 2026-08-17). This band only ever hands
  // over open tasks, which is why the row shipped with `aria-pressed={false}` hardcoded — but
  // Plan Home's `הושלמו` drawer renders the same row, so a completed manual task sat there
  // with an empty circle beside the checks' green ticks. The row is asserted here because
  // this is where the row is tested, not because this band shows one.
  it('reports a settled task as ticked and struck', () => {
    show([task('bought', { status: TASK_STATUS.DONE })]);
    expect(document.querySelector('.tsk-tick')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.wp-listrow')!.classList.contains('tsk-settled')).toBe(true);
    cleanup();
    show([task('open')]);
    expect(document.querySelector('.tsk-tick')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.wp-listrow')!.classList.contains('tsk-settled')).toBe(false);
  });

  // The point of the move, as a shape rather than a class: the meta line holds the deadline
  // and nothing else, which is what stops it wrapping to a third line.
  it('leaves the deadline alone on the meta line', () => {
    show([task('a', { assigneeUserId: 'u1', dueAt: '2026-08-15T09:00:00.000Z' })]);
    const meta = document.querySelector('.wp-listrow-meta')!;
    expect(meta.querySelector('.tsk-due')).toBeTruthy();
    expect(meta.querySelector('.tsk-sep')).toBeNull();
    expect(meta.querySelector('.wp-avatar')).toBeNull();
  });
});
