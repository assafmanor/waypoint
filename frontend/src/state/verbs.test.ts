import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
import { db } from '../db';
import { EVENTS } from '../fixtures';
import { initOutboxCount } from '../lib/outbox';
import {
  applyCreateEvent,
  applyGuardedDelay,
  applyGuardedDelete,
  applyGuardedUpdate,
  applySchedule,
  applySetStatus,
  applyUndo,
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
