import { describe, expect, it } from 'vitest';
import { EVENT_STATUS, type Change, type Membership } from '@waypoint/shared';
import { EVENTS, TRIP } from '../fixtures';
import {
  applyControlChangeToList,
  applyControlChangeToMembers,
  applyControlChangeToTrip,
  initialState,
  reducer,
  TRIP_ACTION,
} from './trip-state';

type State = ReturnType<typeof initialState>;
const find = (s: State, id: string) => s.events.find((e) => e.id === id)!;

describe('reducer verbs + undo', () => {
  it('SET_STATUS then UNDO restores the previous status', () => {
    const s1 = reducer(initialState(), {
      type: TRIP_ACTION.SET_STATUS,
      id: 'ev-goldengai',
      status: EVENT_STATUS.DONE,
    });
    expect(find(s1, 'ev-goldengai').status).toBe(EVENT_STATUS.DONE);
    const s2 = reducer(s1, { type: TRIP_ACTION.UNDO });
    expect(find(s2, 'ev-goldengai').status).toBe(EVENT_STATUS.PLANNED);
  });

  // Ripple is server-authoritative since T-014 (verbs.ts's move() sets it via
  // SET_RIPPLE from the REST response) — DELAY itself never computes one.
  it('DELAY shifts the event locally and leaves ripple untouched until SET_RIPPLE', () => {
    const before = find(initialState(), 'ev-goldengai').startsAt;
    const s1 = reducer(initialState(), {
      type: TRIP_ACTION.DELAY,
      id: 'ev-goldengai',
      minutes: 30,
    });
    expect(find(s1, 'ev-goldengai').startsAt).not.toBe(before);
    expect(s1.ripple).toBeNull();
  });

  it('SET_RIPPLE sets the server-provided suggestion, RIPPLE_APPLY shifts the candidates and is undoable', () => {
    const s0 = reducer(initialState(), {
      type: TRIP_ACTION.DELAY,
      id: 'ev-goldengai',
      minutes: 30,
    });
    const s1 = reducer(s0, {
      type: TRIP_ACTION.SET_RIPPLE,
      ripple: {
        movedTitle: 'גולדן גאי',
        direction: 'later',
        candidates: [{ id: 'ev-walkback', startsAt: '2099-01-01T00:00:00.000Z' }],
      },
    });
    const before = find(s1, 'ev-walkback').startsAt;
    const s2 = reducer(s1, { type: TRIP_ACTION.RIPPLE_APPLY });
    expect(find(s2, 'ev-walkback').startsAt).not.toBe(before);
    expect(s2.ripple).toBeNull();
    const s3 = reducer(s2, { type: TRIP_ACTION.UNDO });
    expect(find(s3, 'ev-walkback').startsAt).toBe(before);
  });

  it('SCHEDULE adds an event, consumes the maybe item, and is undoable', () => {
    const s0 = initialState();
    const event = { ...s0.events[0], id: 'ev-new' };
    const s1 = reducer(s0, { type: TRIP_ACTION.SCHEDULE, event, maybeId: 'mb-skytree' });
    expect(s1.events.some((e) => e.id === 'ev-new')).toBe(true);
    expect(s1.maybeItems.find((m) => m.id === 'mb-skytree')!.consumed).toBe(true);
    const s2 = reducer(s1, { type: TRIP_ACTION.UNDO });
    expect(s2.events.some((e) => e.id === 'ev-new')).toBe(false);
    expect(s2.maybeItems.find((m) => m.id === 'mb-skytree')!.consumed).toBe(false);
  });

  it('RECONCILE_EVENT replaces the optimistic entry with the canonical one', () => {
    const canonical = { ...EVENTS[0], title: 'server truth' };
    const s1 = reducer(initialState(), { type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
    expect(find(s1, canonical.id).title).toBe('server truth');
  });

  it('RECONCILE_EVENT does not clobber a pending undo snapshot', () => {
    const s0 = reducer(initialState(), {
      type: TRIP_ACTION.SET_STATUS,
      id: 'ev-goldengai',
      status: EVENT_STATUS.DONE,
    });
    const s1 = reducer(s0, { type: TRIP_ACTION.RECONCILE_EVENT, event: find(s0, 'ev-goldengai') });
    const s2 = reducer(s1, { type: TRIP_ACTION.UNDO });
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
    const s1 = reducer(initialState(), {
      type: TRIP_ACTION.REMOTE_EVENT_CHANGE,
      change: baseChange,
    });
    expect(find(s1, 'ev-goldengai').status).toBe(EVENT_STATUS.DONE);
  });

  it('removes the event on a remote delete', () => {
    const s1 = reducer(initialState(), {
      type: TRIP_ACTION.REMOTE_EVENT_CHANGE,
      change: { ...baseChange, action: 'delete', after: undefined },
    });
    expect(s1.events.some((e) => e.id === 'ev-goldengai')).toBe(false);
  });

  it('inserts a not-yet-seen event on a remote create', () => {
    const s1 = reducer(initialState(), {
      type: TRIP_ACTION.REMOTE_EVENT_CHANGE,
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
      type: TRIP_ACTION.REMOTE_EVENT_CHANGE,
      change: { ...baseChange, entityType: 'booking' },
    });
    expect(s1).toEqual(initialState());
  });

  // The contract the offline booking→event 'update' mirror relies on (ADR-0093):
  // a partial change that omits `status` merges without resetting a settled event.
  it('a partial update preserves an existing status (schedule-only merge)', () => {
    const s0 = reducer(initialState(), {
      type: TRIP_ACTION.SET_STATUS,
      id: 'ev-goldengai',
      status: EVENT_STATUS.DONE,
    });
    const s1 = reducer(s0, {
      type: TRIP_ACTION.REMOTE_EVENT_CHANGE,
      change: { ...baseChange, action: 'update', after: { startsAt: undefined } },
    });
    expect(find(s1, 'ev-goldengai').startsAt).toBeUndefined();
    expect(find(s1, 'ev-goldengai').status).toBe(EVENT_STATUS.DONE);
  });
});

describe('control-plane change application (ADR-0039)', () => {
  const tripChange = (over: Partial<Change>): Change => ({
    id: 'ch',
    seq: '9',
    tripId: TRIP.id,
    actorUserId: 'u-other',
    entityType: 'trip',
    entityId: TRIP.id,
    action: 'update',
    createdAt: '2026-07-11T00:00:00.000Z',
    ...over,
  });

  const member = (over: Partial<Membership>): Membership => ({
    id: 'mem-1',
    tripId: TRIP.id,
    userId: 'u-noam',
    role: 'peer',
    calendarSyncEnabled: false,
    joinedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  });

  it('merges a remote trip edit onto the local trip', () => {
    const next = applyControlChangeToTrip(TRIP, tripChange({ after: { name: 'שם חדש' } }));
    expect(next.name).toBe('שם חדש');
    expect(next.destination).toBe(TRIP.destination); // untouched fields preserved
  });

  it('leaves the trip unchanged for a delete or a non-trip change', () => {
    expect(applyControlChangeToTrip(TRIP, tripChange({ action: 'delete', after: undefined }))).toBe(
      TRIP,
    );
    expect(applyControlChangeToTrip(TRIP, tripChange({ entityType: 'event' }))).toBe(TRIP);
  });

  it('upserts a membership role change by id', () => {
    const start = [member({})];
    const promoted = member({ role: 'admin' });
    const next = applyControlChangeToMembers(
      start,
      tripChange({
        entityType: 'membership',
        entityId: 'mem-1',
        after: promoted as unknown as Record<string, unknown>,
      }),
    );
    expect(next.find((m) => m.id === 'mem-1')?.role).toBe('admin');
  });

  it('inserts a not-yet-seen membership (a remote join)', () => {
    const fresh = member({ id: 'mem-2', userId: 'u-dana' });
    const next = applyControlChangeToMembers(
      [member({})],
      tripChange({
        entityType: 'membership',
        action: 'create',
        entityId: 'mem-2',
        after: fresh as unknown as Record<string, unknown>,
      }),
    );
    expect(next).toHaveLength(2);
    expect(next.some((m) => m.id === 'mem-2')).toBe(true);
  });

  it('drops a member on a remote removal', () => {
    const next = applyControlChangeToMembers(
      [member({}), member({ id: 'mem-2', userId: 'u-dana' })],
      tripChange({ entityType: 'membership', action: 'delete', entityId: 'mem-2' }),
    );
    expect(next.map((m) => m.id)).toEqual(['mem-1']);
  });
});

describe('applyControlChangeToList (bookings/places WS merge, ADR-0047/0048)', () => {
  type Row = { id: string; name: string; code?: string };
  const change = (over: Partial<Change>): Change => ({
    id: 'ch',
    seq: '9',
    tripId: TRIP.id,
    actorUserId: 'u-other',
    entityType: 'booking',
    entityId: 'bk-1',
    action: 'update',
    createdAt: '2026-07-11T00:00:00.000Z',
    ...over,
  });

  it('merges a partial update over the existing row (leaves other fields intact)', () => {
    const start: Row[] = [{ id: 'bk-1', name: 'Hotel', code: 'ABC' }];
    const next = applyControlChangeToList(start, change({ after: { name: 'Hotel Renamed' } }));
    expect(next[0]).toEqual({ id: 'bk-1', name: 'Hotel Renamed', code: 'ABC' });
  });

  it('appends a peer-created row not seen locally', () => {
    const next = applyControlChangeToList<Row>(
      [{ id: 'bk-1', name: 'Hotel' }],
      change({ action: 'create', entityId: 'bk-2', after: { name: 'Flight' } }),
    );
    expect(next.map((r) => r.id)).toEqual(['bk-1', 'bk-2']);
    expect(next[1].name).toBe('Flight');
  });

  it('drops a row on a remote delete', () => {
    const next = applyControlChangeToList<Row>(
      [
        { id: 'bk-1', name: 'Hotel' },
        { id: 'bk-2', name: 'Flight' },
      ],
      change({ action: 'delete', entityId: 'bk-2', after: undefined }),
    );
    expect(next.map((r) => r.id)).toEqual(['bk-1']);
  });
});

describe('RESYNC', () => {
  it('replaces events/maybeItems wholesale and clears any pending ripple', () => {
    const s0 = reducer(initialState(), {
      type: TRIP_ACTION.DELAY,
      id: 'ev-goldengai',
      minutes: 30,
    });
    const s1 = reducer(s0, {
      type: TRIP_ACTION.SET_RIPPLE,
      ripple: {
        movedTitle: 'x',
        direction: 'later',
        candidates: [{ id: 'ev-walkback', startsAt: 'y' }],
      },
    });
    const s2 = reducer(s1, { type: TRIP_ACTION.RESYNC, events: EVENTS, maybeItems: [] });
    expect(s2.events).toBe(EVENTS);
    expect(s2.maybeItems).toEqual([]);
    expect(s2.ripple).toBeNull();
  });
});
