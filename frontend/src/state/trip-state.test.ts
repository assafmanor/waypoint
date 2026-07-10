import { describe, expect, it } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
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

  it('delaying a soft event proposes a ripple over the following soft event', () => {
    const s1 = reducer(initialState(), { type: 'DELAY', id: 'ev-goldengai', minutes: 30 });
    expect(s1.ripple?.candidates.map((c) => c.id)).toEqual(['ev-walkback']);
  });

  it('delaying a hard event never proposes a ripple (ADR-0011)', () => {
    const s1 = reducer(initialState(), { type: 'DELAY', id: 'ev-ichiran', minutes: 30 });
    expect(s1.ripple).toBeNull();
  });

  it('ripple stops at the first hard anchor', () => {
    // the free-time block (soft) is immediately followed by the hard ramen → nothing to push
    const s1 = reducer(initialState(), { type: 'DELAY', id: 'ev-shinjuku', minutes: 30 });
    expect(s1.ripple).toBeNull();
  });

  it('RIPPLE_APPLY shifts the candidates and is undoable', () => {
    const s1 = reducer(initialState(), { type: 'DELAY', id: 'ev-goldengai', minutes: 30 });
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
});
