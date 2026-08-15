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

const show = (due: Task[], handlers: Partial<Record<string, () => void>> = {}) =>
  render(
    <TripHomeTaskBand
      due={due}
      users={users}
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

  // The row's assignee wrapper is `.tsk-assignee`; `.tsk-who` is the EDITOR's density
  // wrapper and carries a 38px avatar rule (see `tasks-avatar-size.test.ts`).
  it('uses the row’s assignee class, never the editor’s', () => {
    show([task('a', { assigneeUserId: 'u1' })]);
    expect(document.querySelector('.tsk-assignee')).toBeTruthy();
    expect(document.querySelector('.tsk-who')).toBeNull();
  });

  it('says who owes it, and says so even when nobody does', () => {
    show([task('mine', { assigneeUserId: 'u1' })]);
    expect(screen.getByText('אסף')).toBeTruthy();
    cleanup();
    show([task('nobody')]);
    expect(screen.getByText(t.tasks.sheet.nobody)).toBeTruthy();
  });
});
