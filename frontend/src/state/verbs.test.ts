import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
import { EVENTS } from '../fixtures';
import { applySetStatus, applyUndo, type VerbDeps } from './verbs';
import type { Action } from './trip-state';

function fakeDeps(): VerbDeps & { actions: Action[] } {
  const actions: Action[] = [];
  return {
    tripId: 'trip-japan-26',
    dispatch: (a: Action) => actions.push(a),
    toast: vi.fn(),
    lastAction: { current: null },
    actions,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
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

describe('applyUndo', () => {
  it('reverses the last status change over REST', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
