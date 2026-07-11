import { describe, expect, it } from 'vitest';
import { EVENT_STATUS, type Change } from '@waypoint/shared';
import { EVENTS } from '../fixtures';
import { initialState, reducer } from './trip-state';

type State = ReturnType<typeof initialState>;
const find = (s: State, id: string) => s.events.find((e) => e.id === id)!;

describe('reducer verbs + undo', () => {
  it('SET_STATUS then UNDO restores the previous status', () => {
    const s1 = reducer(initialState(), {
      type: 'SET_STATUS',
      id: 'ev-goldengai',
      status: EVENT_STATUS.DONE,
    });
    expect(find(s1, 'ev-goldengai').status).toBe(EVENT_STATUS.DONE);
    const s2 = reducer(s1, { type: 'UNDO' });
    expect(find(s2, 'ev-goldengai').status).toBe(EVENT_STATUS.PLANNED);
  });

  // Ripple is server-authoritative since T-014 (verbs.ts's move() sets it via
  // SET_RIPPLE from the REST response) — DELAY itself never computes one.
  it('DELAY shifts the event locally and leaves ripple untouched until SET_RIPPLE', () => {
    const before = find(initialState(), 'ev-goldengai').startsAt;
    const s1 = reducer(initialState(), { type: 'DELAY', id: 'ev-goldengai', minutes: 30 });
    expect(find(s1, 'ev-goldengai').startsAt).not.toBe(before);
    expect(s1.ripple).toBeNull();
  });

  it('SET_RIPPLE sets the server-provided suggestion, RIPPLE_APPLY shifts the candidates and is undoable', () => {
    const s0 = reducer(initialState(), { type: 'DELAY', id: 'ev-goldengai', minutes: 30 });
    const s1 = reducer(s0, {
      type: 'SET_RIPPLE',
      ripple: {
        movedTitle: 'גולדן גאי',
        candidates: [{ id: 'ev-walkback', startsAt: '2099-01-01T00:00:00.000Z' }],
      },
    });
    const before = find(s1, 'ev-walkback').startsAt;
    const s2 = reducer(s1, { type: 'RIPPLE_APPLY' });
    expect(find(s2, 'ev-walkback').startsAt).not.toBe(before);
    expect(s2.ripple).toBeNull();
    const s3 = reducer(s2, { type: 'UNDO' });
    expect(find(s3, 'ev-walkback').startsAt).toBe(before);
  });

  it('SCHEDULE adds an event, consumes the maybe item, and is undoable', () => {
    const s0 = initialState();
    const event = { ...s0.events[0], id: 'ev-new' };
    const s1 = reducer(s0, { type: 'SCHEDULE', event, maybeId: 'mb-skytree' });
    expect(s1.events.some((e) => e.id === 'ev-new')).toBe(true);
    expect(s1.maybeItems.find((m) => m.id === 'mb-skytree')!.consumed).toBe(true);
    const s2 = reducer(s1, { type: 'UNDO' });
    expect(s2.events.some((e) => e.id === 'ev-new')).toBe(false);
    expect(s2.maybeItems.find((m) => m.id === 'mb-skytree')!.consumed).toBe(false);
  });

  it('RECONCILE_EVENT replaces the optimistic entry with the canonical one', () => {
    const canonical = { ...EVENTS[0], title: 'server truth' };
    const s1 = reducer(initialState(), { type: 'RECONCILE_EVENT', event: canonical });
    expect(find(s1, canonical.id).title).toBe('server truth');
  });

  it('RECONCILE_EVENT does not clobber a pending undo snapshot', () => {
    const s0 = reducer(initialState(), {
      type: 'SET_STATUS',
      id: 'ev-goldengai',
      status: EVENT_STATUS.DONE,
    });
    const s1 = reducer(s0, { type: 'RECONCILE_EVENT', event: find(s0, 'ev-goldengai') });
    const s2 = reducer(s1, { type: 'UNDO' });
    expect(find(s2, 'ev-goldengai').status).toBe(EVENT_STATUS.PLANNED);
  });
});

describe('REMOTE_EVENT_CHANGE (WS)', () => {
  const baseChange: Change = {
    id: 'ch-1',
    seq: '1',
    tripId: 'trip-japan-26',
    actorUserId: 'u-someone-else',
    entityType: 'event',
    entityId: 'ev-goldengai',
    action: 'status',
    after: { status: EVENT_STATUS.DONE },
    createdAt: '2026-07-11T00:00:00.000Z',
  };

  it('merges a remote change into the matching local event', () => {
    const s1 = reducer(initialState(), { type: 'REMOTE_EVENT_CHANGE', change: baseChange });
    expect(find(s1, 'ev-goldengai').status).toBe(EVENT_STATUS.DONE);
  });

  it('removes the event on a remote delete', () => {
    const s1 = reducer(initialState(), {
      type: 'REMOTE_EVENT_CHANGE',
      change: { ...baseChange, action: 'delete', after: undefined },
    });
    expect(s1.events.some((e) => e.id === 'ev-goldengai')).toBe(false);
  });

  it('inserts a not-yet-seen event on a remote create', () => {
    const s1 = reducer(initialState(), {
      type: 'REMOTE_EVENT_CHANGE',
      change: {
        ...baseChange,
        entityId: 'ev-remote-new',
        action: 'create',
        after: { title: 'שיפוט מרחוק', kind: 'soft', date: '2026-07-11' },
      },
    });
    const created = find(s1, 'ev-remote-new');
    expect(created.title).toBe('שיפוט מרחוק');
    expect(created.status).toBe(EVENT_STATUS.PLANNED);
  });

  it('ignores changes for entity types this reducer does not own', () => {
    const s1 = reducer(initialState(), {
      type: 'REMOTE_EVENT_CHANGE',
      change: { ...baseChange, entityType: 'booking' },
    });
    expect(s1).toEqual(initialState());
  });
});

describe('RESYNC', () => {
  it('replaces events/maybeItems wholesale and clears any pending ripple', () => {
    const s0 = reducer(initialState(), { type: 'DELAY', id: 'ev-goldengai', minutes: 30 });
    const s1 = reducer(s0, {
      type: 'SET_RIPPLE',
      ripple: { movedTitle: 'x', candidates: [{ id: 'ev-walkback', startsAt: 'y' }] },
    });
    const s2 = reducer(s1, { type: 'RESYNC', events: EVENTS, maybeItems: [] });
    expect(s2.events).toBe(EVENTS);
    expect(s2.maybeItems).toEqual([]);
    expect(s2.ripple).toBeNull();
  });
});
