import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
import { db } from '../db';
import { EVENTS, MAYBE_ITEMS } from '../fixtures';
import { initOutboxCount } from '../lib/outbox';
import { DEFAULT_SCHEDULE_SLOT } from '../constants';
import { zonedIso } from '../lib/time';
import {
  applyCreateEvent,
  applyGuardedDelay,
  applyGuardedDelete,
  applyAddMaybe,
  applyGuardedUpdate,
  applyPark,
  applyRemoveMaybe,
  applyReorder,
  applySchedule,
  applySetStatus,
  applyUndo,
  buildScheduleEvent,
  type VerbDeps,
} from './verbs';
import type { Action } from './trip-state';

function fakeDeps(confirmHardEdit?: VerbDeps['confirmHardEdit']): VerbDeps & { actions: Action[] } {
  const actions: Action[] = [];
  return {
    tripId: 'trip-japan-26',
    dispatch: (a: Action) => actions.push(a),
    toast: vi.fn(),
    lastAction: { current: null },
    confirmHardEdit: confirmHardEdit ?? vi.fn().mockResolvedValue(true),
    actions,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.outbox.clear();
  await initOutboxCount();
});

describe('applySetStatus (optimistic apply / rollback)', () => {
  const event = EVENTS.find((e) => e.id === 'ev-goldengai')!;

  it('applies optimistically, then reconciles with the canonical entity on success', async () => {
    const canonical = { ...event, status: EVENT_STATUS.DONE, updatedAt: 'server-time' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(canonical), { status: 200 })),
    );
    const deps = fakeDeps();
    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(deps.actions[0]).toEqual({
      type: 'SET_STATUS',
      id: event.id,
      status: EVENT_STATUS.DONE,
    });
    expect(deps.actions[1]).toEqual({ type: 'RECONCILE_EVENT', event: canonical });
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic change and toasts on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(deps.actions[0]).toEqual({
      type: 'SET_STATUS',
      id: event.id,
      status: EVENT_STATUS.DONE,
    });
    expect(deps.actions[1]).toEqual({ type: 'UNDO' });
    expect(deps.toast).toHaveBeenCalledTimes(1);
  });

  it('surfaces a 409 HARD_EVENT_REQUIRES_CONFIRM distinctly from a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'HARD_EVENT_REQUIRES_CONFIRM', message: 'confirm' } }),
            { status: 409 },
          ),
        ),
    );
    const deps = fakeDeps();
    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(deps.actions[1]).toEqual({ type: 'UNDO' });
    const [, message] = (deps.toast as ReturnType<typeof vi.fn>).mock.calls[0];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const genericDeps = fakeDeps();
    await applySetStatus(genericDeps, event, EVENT_STATUS.DONE);
    const [, genericMessage] = (genericDeps.toast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(message).not.toBe(genericMessage);
  });
});

describe('applyGuardedDelay (hard-event confirmation gate, ADR-0011)', () => {
  const hardEvent = EVENTS.find((e) => e.id === 'ev-ichiran')!;
  const softEvent = EVENTS.find((e) => e.id === 'ev-goldengai')!;

  it('asks for confirmation and applies the delay when a hard event is confirmed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(hardEvent), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedDelay(deps, hardEvent, 30);

    expect(confirmHardEdit).toHaveBeenCalledWith(hardEvent);
    expect(applied).toBe(true);
    expect(deps.actions.some((a) => a.type === 'DELAY')).toBe(true);
    // the backend's own hard-event guard (T-010) also requires `confirm=true`
    // on the write itself, independent of this client-side gate.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('confirm=true'),
      expect.anything(),
    );
  });

  it('is a true no-op when the hard-event confirmation is cancelled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(false);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedDelay(deps, hardEvent, 30);

    expect(applied).toBe(false);
    expect(deps.actions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies a soft-event delay without asking for confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(softEvent), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedDelay(deps, softEvent, 30);

    expect(confirmHardEdit).not.toHaveBeenCalled();
    expect(applied).toBe(true);
    expect(deps.actions.some((a) => a.type === 'DELAY')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining('confirm=true'),
      expect.anything(),
    );
  });
});

describe('applyCreateEvent', () => {
  it('applies optimistically, POSTs, and reconciles with the canonical entity', async () => {
    const draft = { ...EVENTS[0], id: 'ev-new', title: 'New event' };
    const canonical = { ...draft, updatedAt: 'server-time' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(canonical), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const deps = fakeDeps();

    await applyCreateEvent(deps, draft);

    expect(deps.actions[0]).toEqual({ type: 'CREATE_EVENT', event: draft });
    expect(deps.actions[1]).toEqual({ type: 'RECONCILE_EVENT', event: canonical });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('applyGuardedUpdate (hard-event confirmation gate, ADR-0011)', () => {
  const hardEvent = EVENTS.find((e) => e.id === 'ev-ichiran')!;
  const softEvent = EVENTS.find((e) => e.id === 'ev-goldengai')!;
  const patch = { title: 'Ichiran (renamed)' };

  it('asks for confirmation before PATCHing a hard event, with confirm=true on the wire', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(hardEvent), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedUpdate(deps, hardEvent, patch);

    expect(confirmHardEdit).toHaveBeenCalledWith(hardEvent, 'edit');
    expect(applied).toBe(true);
    expect(deps.actions.some((a) => a.type === 'UPDATE_EVENT')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('confirm=true'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('is a true no-op when the hard-event confirmation is cancelled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(false);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedUpdate(deps, hardEvent, patch);

    expect(applied).toBe(false);
    expect(deps.actions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updates a soft event without asking for confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(softEvent), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedUpdate(deps, softEvent, patch);

    expect(confirmHardEdit).not.toHaveBeenCalled();
    expect(applied).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining('confirm=true'),
      expect.anything(),
    );
  });
});

describe('applyGuardedDelete (hard-event confirmation gate, ADR-0011)', () => {
  const hardEvent = EVENTS.find((e) => e.id === 'ev-ichiran')!;
  const softEvent = EVENTS.find((e) => e.id === 'ev-goldengai')!;

  it('asks for delete confirmation and deletes with confirm=true when a hard event is confirmed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedDelete(deps, hardEvent);

    expect(confirmHardEdit).toHaveBeenCalledWith(hardEvent, 'delete');
    expect(applied).toBe(true);
    expect(deps.actions).toEqual([{ type: 'DELETE_EVENT', id: hardEvent.id }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('confirm=true'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('is a true no-op when the hard-event delete confirmation is cancelled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(false);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedDelete(deps, hardEvent);

    expect(applied).toBe(false);
    expect(deps.actions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes a soft event without asking for confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit);

    const applied = await applyGuardedDelete(deps, softEvent);

    expect(confirmHardEdit).not.toHaveBeenCalled();
    expect(applied).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining('confirm=true'),
      expect.anything(),
    );
  });

  it('rolls back and toasts when the DELETE request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    await applyGuardedDelete(deps, softEvent);

    expect(deps.actions[0]).toEqual({ type: 'DELETE_EVENT', id: softEvent.id });
    expect(deps.actions[1]).toEqual({ type: 'UNDO' });
    expect(deps.toast).toHaveBeenCalledTimes(1);
  });
});

describe('applyUndo', () => {
  it('reverses the last status change over REST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...EVENTS[0], status: EVENT_STATUS.PLANNED }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const deps = fakeDeps();
    deps.lastAction.current = {
      kind: 'status',
      id: 'ev-goldengai',
      previous: EVENT_STATUS.PLANNED,
    };

    await applyUndo(deps);

    expect(deps.actions).toEqual([{ type: 'UNDO' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/ev-goldengai/status'),
      expect.objectContaining({ body: JSON.stringify({ status: EVENT_STATUS.PLANNED }) }),
    );
    expect(deps.lastAction.current).toBeNull();
  });

  it('is a no-op REST-wise when there is nothing to undo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const deps = fakeDeps();
    await applyUndo(deps);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('applySchedule (T-058: persists the maybe-item consumed flag server-side)', () => {
  const event = { ...EVENTS[0], id: 'ev-new' };

  it('creates the event then consumes the maybe item, both over REST', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve(new Response(JSON.stringify(event), { status: 200 }));
      }),
    );
    const deps = fakeDeps();

    await applySchedule(deps, event, 'mb-skytree');

    expect(calls[0]).toContain('/events');
    expect(calls[1]).toContain('/maybe-items/mb-skytree/consume');
  });

  it('queues both writes in the outbox when offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });
    const deps = fakeDeps();

    await applySchedule(deps, event, 'mb-skytree');

    expect(fetchMock).not.toHaveBeenCalled();
    const queued = (await db.outbox.toArray()).map((e) => e.op);
    expect(queued).toEqual([
      { verb: 'create', input: expect.objectContaining({ id: 'ev-new' }) },
      { verb: 'consumeMaybeItem', maybeItemId: 'mb-skytree' },
    ]);
  });
});

describe('buildScheduleEvent (F-02: quick-schedule builds instants in the trip timezone)', () => {
  const m = MAYBE_ITEMS[0];
  const now = '2026-07-15T00:00:00.000Z';

  // A DST-active summer date, so a fixed-offset shortcut would be wrong in both zones.
  it.each([
    ['Europe/London', '2026-07-15'], // BST, UTC+1
    ['America/New_York', '2026-07-15'], // EDT, UTC-4
  ])(
    'resolves the default slot in %s for a quick-schedule (no fields), not Asia/Tokyo',
    (timezone, activeDate) => {
      const trip = { id: 'trip-x', timezone };

      const event = buildScheduleEvent(trip, activeDate, m, now, 'u-test');

      // F-05: attribution is the passed-in user, never a fixture.
      expect(event.updatedBy).toBe('u-test');
      expect(event.startsAt).toBe(zonedIso(activeDate, DEFAULT_SCHEDULE_SLOT.START, timezone));
      expect(event.endsAt).toBe(zonedIso(activeDate, DEFAULT_SCHEDULE_SLOT.END, timezone));
      // Regression guard: the old code interpolated a hardcoded +09:00 offset,
      // which lands on a different instant for any non-Tokyo trip.
      const tokyoInstant = Date.parse(`${activeDate}T${DEFAULT_SCHEDULE_SLOT.START}:00+09:00`);
      expect(Date.parse(event.startsAt!)).not.toBe(tokyoInstant);
    },
  );

  it('honours explicit fields (builder picker) over the default slot', () => {
    const trip = { id: 'trip-x', timezone: 'Europe/London' };
    const fields = {
      date: '2026-07-16',
      title: 'Picked',
      kind: 'soft' as const,
      startsAt: '2026-07-16T10:00:00.000Z',
      endsAt: '2026-07-16T11:00:00.000Z',
    };

    const event = buildScheduleEvent(trip, '2026-07-15', m, now, 'u-test', fields);

    expect(event.startsAt).toBe(fields.startsAt);
    expect(event.endsAt).toBe(fields.endsAt);
    expect(event.date).toBe(fields.date);
  });
});

describe('offline write outbox (T-013)', () => {
  const event = EVENTS.find((e) => e.id === 'ev-goldengai')!;

  it('queues the mutation instead of failing outright when offline, keeping the optimistic state', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });
    const deps = fakeDeps();

    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.actions).toEqual([{ type: 'SET_STATUS', id: event.id, status: EVENT_STATUS.DONE }]); // no UNDO — the optimistic change is what's queued, not rolled back
    expect(deps.toast).not.toHaveBeenCalled();

    const queued = await db.outbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].op).toEqual({
      verb: 'setStatus',
      eventId: event.id,
      status: EVENT_STATUS.DONE,
    });
  });

  it('queues on a network failure (fetch throws) the same way as an explicit offline check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const deps = fakeDeps();

    await applyCreateEvent(deps, event);

    expect(deps.actions.some((a) => a.type === 'UNDO')).toBe(false);
    expect(deps.toast).not.toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(1);
  });

  it('still rolls back and toasts on a real HTTP error while online (unaffected by the outbox)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(deps.actions[1]).toEqual({ type: 'UNDO' });
    expect(deps.toast).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('applyReorder', () => {
  const a = EVENTS.find((e) => e.id === 'ev-tsukiji')!; // soft
  const b = EVENTS.find((e) => e.id === 'ev-senso')!; // soft
  const patches = [
    { id: a.id, patch: { startsAt: b.startsAt, endsAt: b.endsAt, sortOrder: b.sortOrder } },
    { id: b.id, patch: { startsAt: a.startsAt, endsAt: a.endsAt, sortOrder: a.sortOrder } },
  ];

  it('applies one REORDER optimistically, then reconciles each moved event', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(JSON.stringify({ ...a, updatedAt: 'server' }), { status: 200 }),
          ),
        ),
    );
    const deps = fakeDeps();
    await applyReorder(deps, patches, [a, b]);

    expect(deps.actions[0]).toEqual({ type: 'REORDER', patches });
    expect(deps.actions.filter((x) => x.type === 'RECONCILE_EVENT')).toHaveLength(2);
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('rolls back and toasts on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applyReorder(deps, patches, [a, b]);
    expect(deps.actions.some((x) => x.type === 'UNDO')).toBe(true);
    expect(deps.toast).toHaveBeenCalled();
  });

  it('is a no-op with no patches', async () => {
    const deps = fakeDeps();
    await applyReorder(deps, [], [a, b]);
    expect(deps.actions).toHaveLength(0);
  });
});

describe('applyPark (move a soft event to the maybe shelf)', () => {
  const event = EVENTS.find((e) => e.id === 'ev-goldengai')!; // soft
  const item = {
    id: 'mb-parked',
    tripId: 'trip-japan-26',
    title: event.title,
    icon: event.icon,
    placeId: event.placeId,
    createdBy: 'u-assaf',
    consumed: false,
    createdAt: 'now',
    updatedAt: 'now',
    updatedBy: 'u-assaf',
  };

  it('dispatches one PARK_EVENT optimistically, then creates the idea and deletes the event', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Promise.resolve(new Response(JSON.stringify(item), { status: 201 }));
      }),
    );
    const deps = fakeDeps();

    await applyPark(deps, event, item);

    expect(deps.actions[0]).toEqual({ type: 'PARK_EVENT', eventId: event.id, item });
    expect(deps.actions.some((a) => a.type === 'UNDO')).toBe(false);
    expect(deps.lastAction.current).toEqual({ kind: 'park', event, maybeId: item.id });
    expect(calls[0].url).toContain('/maybe-items');
    expect(calls[1]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining(`/events/${event.id}`),
        method: 'DELETE',
      }),
    );
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('rolls back and toasts when the create fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    await applyPark(deps, event, item);

    expect(deps.actions[0]).toEqual({ type: 'PARK_EVENT', eventId: event.id, item });
    expect(deps.actions.at(-1)).toEqual({ type: 'UNDO' });
    expect(deps.toast).toHaveBeenCalledTimes(1);
  });
});

describe('applyAddMaybe / applyRemoveMaybe (shelf build/remove)', () => {
  const item = MAYBE_ITEMS[0];

  it('adds optimistically and POSTs, no rollback on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(item), { status: 201 })),
    );
    const deps = fakeDeps();
    await applyAddMaybe(deps, item);
    expect(deps.actions[0]).toEqual({ type: 'ADD_MAYBE', item });
    expect(deps.actions.some((a) => a.type === 'UNDO')).toBe(false);
  });

  it('rolls back the optimistic add and toasts on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applyAddMaybe(deps, item);
    expect(deps.actions.at(-1)).toEqual({ type: 'UNDO' });
    expect(deps.toast).toHaveBeenCalled();
  });

  it('removes optimistically and DELETEs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const deps = fakeDeps();
    await applyRemoveMaybe(deps, item);
    expect(deps.actions[0]).toEqual({ type: 'REMOVE_MAYBE', id: item.id });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/maybe-items/${item.id}`),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rolls back the optimistic remove on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applyRemoveMaybe(deps, item);
    expect(deps.actions.at(-1)).toEqual({ type: 'UNDO' });
    expect(deps.toast).toHaveBeenCalled();
  });
});
