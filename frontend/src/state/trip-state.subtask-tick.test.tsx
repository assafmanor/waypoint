// @vitest-environment jsdom
// **A parent's tick writes its STEPS** (ADR-0196 §3, reversed 2026-08-19 on the owner's
// _"you should be able to tick the parent task to mark all as complete"_).
//
// Provider-level, because that is where the reversal actually lives: `taskVerbs.tickTask` is
// the ONE place that knows a parent has no completion of its own, and the six surfaces that
// draw a tick call it without knowing. A per-surface version of this rule is the clause six
// call sites would each have to remember, which is exactly how ADR-0193 §2's count went wrong.
//
// What only this level can see: which rows are written, in which direction, and that the undo
// the toast carries restores what was there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TASK_STATUS, type Task, type TripSnapshot } from '@waypoint/shared';
import { TRIP } from '../fixtures';

const h = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  ops: [] as Array<{ taskId?: string; input?: { status?: string } }>,
  toasts: [] as Array<{ text: string; undo?: () => void }>,
}));

vi.mock('../lib/api', () => ({
  fetchSnapshot: h.fetchSnapshot,
  fetchChanges: vi.fn().mockResolvedValue([]),
  isHardEventConfirmError: () => false,
}));
vi.mock('../lib/cache', () => ({
  cacheSnapshot: vi.fn().mockResolvedValue(undefined),
  readCachedSnapshot: vi.fn().mockResolvedValue(null),
  applyChangeToCache: vi.fn(),
  clearTripCache: vi.fn(),
  coerceClearedFields: (patch: unknown) => patch,
  coerceTripPatch: (patch: unknown) => patch,
}));
vi.mock('../lib/outbox', () => ({
  isOffline: () => true,
  flushOutbox: vi.fn().mockResolvedValue(undefined),
  getSyncFailures: () => [],
  subscribeSyncFailures: () => () => {},
  // Offline, so every write is a queued op — which is precisely the record this spec reads.
  restOrQueue: async (_tripId: string, op: { taskId?: string; input?: { status?: string } }) => {
    h.ops.push(op);
    return undefined;
  },
  OUTBOX_VERB: {},
}));
vi.mock('../lib/ws', () => ({ openTripStream: () => () => {} }));
vi.mock('../lib/useClock', () => ({
  getNow: () => Date.parse('2026-08-19T09:00:00.000Z'),
  useClock: () => new Date('2026-08-19T09:00:00.000Z'),
}));
vi.mock('./auth-state', () => ({ useAuth: () => ({ me: null }) }));
vi.mock('../ui/Toast', () => ({
  useToast: () => (_icon: string, text: string, undo?: () => void) => {
    h.toasts.push({ text, undo });
  },
}));

import { TripProvider, useTrip } from './trip-state';
import { t } from '../i18n/he';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  tripId: TRIP.id,
  title: id,
  dueHasTime: false,
  important: false,
  status: TASK_STATUS.OPEN,
  createdBy: 'u-assaf',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u-assaf',
  ...over,
});

const step = (id: string, over: Partial<Task> = {}) => task(id, { parentTaskId: 'p', ...over });
const settled = (id: string) =>
  step(id, { status: TASK_STATUS.DONE, settledAt: '2026-08-02T10:00:00.000Z', settledBy: 'u1' });

const snapshotOf = (tasks: Task[]): TripSnapshot => ({
  trip: TRIP,
  members: [],
  users: [],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  notes: [],
  tasks,
  documentAttachments: [],
  enrichments: {},
  fxRates: null,
  latestSeq: '10',
});

let tick: ((task: Task) => Promise<void>) | null = null;
let create: ((input: Record<string, unknown>) => Promise<unknown>) | null = null;

function Probe() {
  const { tasks, subtasks, taskVerbs } = useTrip();
  tick = taskVerbs.tickTask;
  create = taskVerbs.createTask as typeof create;
  return (
    <>
      <div data-testid="ids">{tasks.map((x) => `${x.id}:${x.status}`).join(',')}</div>
      <div data-testid="kids">{(subtasks.get('p') ?? []).map((x) => x.id).join(',')}</div>
    </>
  );
}

const mount = async (tasks: Task[]) => {
  h.fetchSnapshot.mockResolvedValue(snapshotOf(tasks));
  render(
    <MemoryRouter initialEntries={['/']}>
      <TripProvider tripId={TRIP.id}>
        <Probe />
      </TripProvider>
    </MemoryRouter>,
  );
  await screen.findByTestId('ids');
};

const press = async (target: Task) => {
  await act(async () => {
    await tick?.(target);
  });
};

const written = () => h.ops.map((op) => `${op.taskId}:${op.input?.status}`);
const parent = task('p');

beforeEach(() => {
  h.ops = [];
  h.toasts = [];
  tick = null;
});
afterEach(cleanup);

describe("a parent's tick answers for its steps", () => {
  it('settles every open step and writes NOTHING to the parent itself', async () => {
    await mount([parent, settled('s1'), step('s2'), step('s3')]);
    await press(parent);
    // The parent's own row is derived, so writing it would be the stale `done` the ADR
    // rejected stored completion to avoid.
    expect(written()).toEqual(['s2:done', 's3:done']);
  });

  it('reopens them all once every one is settled', async () => {
    await mount([parent, settled('s1'), settled('s2')]);
    await press(parent);
    expect(written()).toEqual(['s1:open', 's2:open']);
  });

  // The one human answer no derivation produces. A bulk verb that swept it up would erase a
  // decision rather than record one.
  it('never touches a dismissed step', async () => {
    await mount([parent, step('s1'), step('s2', { status: TASK_STATUS.DISMISSED })]);
    await press(parent);
    expect(written()).toEqual(['s1:done']);
  });

  it('leaves an ordinary task ticking itself, exactly as before', async () => {
    const leaf = task('solo');
    await mount([leaf]);
    await press(leaf);
    expect(written()).toEqual(['solo:done']);
  });
});

describe('one press, one toast, one undo', () => {
  it('confirms how many rows it wrote', async () => {
    await mount([parent, step('s1'), step('s2')]);
    await press(parent);
    expect(h.toasts.map((x) => x.text)).toEqual([t.tasks.subtasks.allTicked(2)]);
  });

  // The reason the undo has to exist at all: everything is LWW (ADR-0012), so the reopening
  // direction writes over ticks other people put there. This is what gives them back.
  it('puts every step back the way it was', async () => {
    await mount([parent, settled('s1'), settled('s2')]);
    await press(parent);
    expect(h.toasts[0].text).toBe(t.tasks.subtasks.allReopened(2));
    h.ops = [];
    await act(async () => {
      h.toasts[0].undo?.();
    });
    expect(written()).toEqual(['s1:done', 's2:done']);
  });

  it('says nothing when a press had nothing to write', async () => {
    await mount([parent, step('s1', { status: TASK_STATUS.DISMISSED })]);
    await press(parent);
    expect(h.ops).toEqual([]);
    expect(h.toasts).toEqual([]);
  });
});

// **One create leaves ONE row, and it lands under its parent.** Written while chasing a step
// that looked like it had been written twice; it had not (the spec's fixture already carried
// that title), but the question is worth an assertion since nothing else here holds the
// boundary and the optimistic append to the same flat list.
describe('a created step lands once, under its parent', () => {
  it('appends it to the parent’s steps and to nothing else', async () => {
    await mount([parent]);
    await act(async () => {
      await create?.({ id: 'step-000000009', title: 'לשלם על החניה', parentTaskId: 'p' });
    });
    expect(screen.getByTestId('ids').textContent).toBe('p:open');
    expect(screen.getByTestId('kids').textContent).toBe('step-000000009');
  });
});
