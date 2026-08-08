import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  EVENT_STATUS,
  type CreateBookingInput,
  type MaybeItem,
  type DocumentAttachment,
  type Note,
  type NoteHostKey,
  type Place,
} from '@waypoint/shared';
import { db } from '../db';
import { EVENTS, MAYBE_ITEMS } from '../fixtures';
import { initOutboxCount, OUTBOX_VERB } from '../lib/outbox';
import { DEFAULT_SCHEDULE_SLOT } from '../constants';
import { zonedIso } from '../lib/time';
import {
  applyBookEvent,
  applyConsumeMaybeItem,
  applyCreateEvent,
  applyDeletePlace,
  applyGuardedDelay,
  applyGuardedDelete,
  applyAddMaybe,
  applyGuardedUpdate,
  applyPark,
  applyReplace,
  applySetMaybeDay,
  applyRemoveMaybe,
  applyEventPatches,
  applySchedule,
  applySetStatus,
  applyUndo,
  buildScheduleEvent,
  type VerbDeps,
} from './verbs';
import { TRIP_ACTION, type Action } from './trip-state';
import type { PlaceLink } from '../lib/place-refs';

function fakeDeps(
  confirmHardEdit?: VerbDeps['confirmHardEdit'],
  /** The trip's notes, for the conversions that have to carry them (ADR-0152 §5's
   *  amendment). Empty by default, so every test that is not about notes reads as before. */
  notes: Note[] = [],
  /** The trip's document links, for the undo that has to put them back (ADR-0173 §7).
   *  Empty by default, so every test that is not about attachments reads as before. */
  attachments: DocumentAttachment[] = [],
): VerbDeps & {
  actions: Action[];
  bookings: { createBooking: Mock; deleteBooking: Mock; updateBooking: Mock };
  places: { createPlace: Mock; deletePlace: Mock };
  notes: { list: Note[]; rehost: Mock; recreate: Mock };
  attachments: { list: DocumentAttachment[]; recreate: Mock };
} {
  const actions: Action[] = [];
  return {
    tripId: 'trip-japan-26',
    dispatch: (a: Action) => actions.push(a),
    toast: vi.fn(),
    lastAction: { current: null },
    confirmHardEdit: confirmHardEdit ?? vi.fn().mockResolvedValue(true),
    // The booking half (ADR-0136 §3). Bookings live in trip-state's own state, so the verbs
    // reach them through the writers that own them — which makes them a mock here.
    bookings: {
      createBooking: vi.fn(async (input: CreateBookingInput) => ({
        ...input,
        id: input.id ?? 'bk-new',
      })),
      deleteBooking: vi.fn(async () => {}),
      updateBooking: vi.fn(async () => {}),
    } as unknown as { createBooking: Mock; deleteBooking: Mock; updateBooking: Mock },
    // The place half (ADR-0157), same arrangement: `deletePlace` owns the write AND the
    // local cascade in trip-state, so here it only has to report the links it cleared.
    places: {
      createPlace: vi.fn(async () => 'pl-restored'),
      deletePlace: vi.fn(async () => []),
    } as unknown as { createPlace: Mock; deletePlace: Mock },
    // The notes half, same shape and same reason as the bookings one above.
    notes: {
      list: notes,
      rehost: vi.fn(async () => {}),
      recreate: vi.fn(async () => {}),
    } as unknown as {
      list: Note[];
      rehost: Mock;
      recreate: Mock;
    },
    // The attachment half, same shape and same reason (ADR-0173 §7).
    attachments: {
      list: attachments,
      recreate: vi.fn(async () => {}),
    } as unknown as { list: DocumentAttachment[]; recreate: Mock },
    actions,
  };
}

/** A document link on an event, minimal — only the fields the undo carries. */
const linkOn = (id: string, eventId: string): DocumentAttachment => ({
  id,
  tripId: 'trip-japan-26',
  documentId: `doc-${id}`,
  eventId,
  bookingId: undefined,
  createdBy: 'u1',
  createdAt: '2026-07-19T00:00:00.000Z',
});

/** A note on a host, minimal — only the fields a conversion reads. */
const noteOn = (id: string, host: Partial<Record<NoteHostKey, string>>): Note =>
  ({
    id,
    tripId: 'trip-japan-26',
    body: `הפתק ${id}`,
    source: 'member',
    createdBy: 'u1',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    updatedBy: 'u1',
    ...host,
  }) as Note;

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
      type: TRIP_ACTION.SET_STATUS,
      id: event.id,
      status: EVENT_STATUS.DONE,
    });
    expect(deps.actions[1]).toEqual({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic change and toasts on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(deps.actions[0]).toEqual({
      type: TRIP_ACTION.SET_STATUS,
      id: event.id,
      status: EVENT_STATUS.DONE,
    });
    expect(deps.actions[1]).toEqual({ type: TRIP_ACTION.UNDO });
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

    expect(deps.actions[1]).toEqual({ type: TRIP_ACTION.UNDO });
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
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.DELAY)).toBe(true);
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
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.DELAY)).toBe(true);
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

    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.CREATE_EVENT, event: draft });
    expect(deps.actions[1]).toEqual({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
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
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UPDATE_EVENT)).toBe(true);
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

    expect(confirmHardEdit).toHaveBeenCalledWith(hardEvent, 'delete', { notes: 0 });
    expect(applied).toBe(true);
    expect(deps.actions).toEqual([{ type: TRIP_ACTION.DELETE_EVENT, id: hardEvent.id }]);
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

    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.DELETE_EVENT, id: softEvent.id });
    expect(deps.actions[1]).toEqual({ type: TRIP_ACTION.UNDO });
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

    expect(deps.actions).toEqual([{ type: TRIP_ACTION.UNDO }]);
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

  // THE GAP THIS CLOSES (found session 185, fixed 186). Undoing a schedule restored the idea
  // locally through the reducer's snapshot but never told the server, so the next resync
  // re-consumed it and the idea vanished a second time. Fails if the undo only deletes the event.
  it('undoing a schedule puts the idea back on the shelf server-side, not only locally', async () => {
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Promise.resolve(new Response(JSON.stringify(event), { status: 200 }));
      }),
    );
    const deps = fakeDeps();

    await applySchedule(deps, event, 'mb-skytree');
    // The descriptor has to remember WHICH idea was consumed, or the undo cannot name it.
    expect(deps.lastAction.current).toEqual({
      kind: 'create',
      id: 'ev-new',
      maybeId: 'mb-skytree',
    });

    calls.length = 0;
    await applyUndo(deps);

    expect(calls.some((c) => c.url.includes(`/events/${event.id}`) && c.method === 'DELETE')).toBe(
      true,
    );
    expect(calls.some((c) => c.url.includes('/maybe-items/mb-skytree/restore'))).toBe(true);
  });

  // A plain create took no idea, so its undo must not try to restore one.
  it('undoing a plain create restores nothing', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve(new Response(JSON.stringify(event), { status: 200 }));
      }),
    );
    const deps = fakeDeps();

    await applyCreateEvent(deps, event);
    expect(deps.lastAction.current).toEqual({ kind: 'create', id: 'ev-new', maybeId: undefined });
    calls.length = 0;
    await applyUndo(deps);
    expect(calls.some((c) => c.includes('/restore'))).toBe(false);
  });

  it('queues the restore when the undo happens offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(event))));
    const deps = fakeDeps();
    await applySchedule(deps, event, 'mb-skytree');

    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('navigator', { onLine: false });
    await db.outbox.clear();
    await applyUndo(deps);

    expect((await db.outbox.toArray()).map((e) => e.op)).toEqual([
      { verb: OUTBOX_VERB.DELETE, eventId: 'ev-new', confirm: false },
      { verb: OUTBOX_VERB.RESTORE_MAYBE_ITEM, maybeItemId: 'mb-skytree' },
    ]);
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
      { verb: OUTBOX_VERB.CREATE, input: expect.objectContaining({ id: 'ev-new' }) },
      { verb: OUTBOX_VERB.CONSUME_MAYBE_ITEM, maybeItemId: 'mb-skytree' },
    ]);
  });
});

// ADR-0136 §1/§3: a booked save is ONE action to the user and up to three writes underneath.
// Every test here is written as the reproduction of a specific way that can go wrong.
describe('applyBookEvent (an event that is also booked, ADR-0136)', () => {
  const unlinked = EVENTS.find((e) => e.id === 'ev-goldengai')!;
  const input = { type: 'restaurant' as const, title: 'רמן נאגי' };

  const okFetch = () => {
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Promise.resolve(new Response(JSON.stringify(unlinked), { status: 200 }));
      }),
    );
    return calls;
  };

  // FAILS if a booked create writes an event of its own: the server derives the linked event
  // from the seed, so a second write would produce two.
  it('on a NEW event writes only the booking, seed and all', async () => {
    const calls = okFetch();
    const deps = fakeDeps();

    const applied = await applyBookEvent(deps, { ...input, event: { date: '2026-07-26' } });

    // It resolves to the BOOKING, not to a boolean — and on this path that matters beyond
    // tidiness: the linked event is the server's (from the seed), so the booking's
    // client-generated id is the only one a caller can hold, which is what lets the form
    // write notes behind it (ADR-0152 §6b).
    expect(applied).toMatchObject({ id: 'bk-new' });
    expect(deps.bookings.createBooking).toHaveBeenCalledTimes(1);
    expect(deps.bookings.createBooking.mock.calls[0][0]).toMatchObject({
      event: { date: '2026-07-26' },
    });
    // No event POST/PATCH of our own.
    expect(calls.filter((c) => c.url.includes('/events'))).toEqual([]);
    expect(deps.lastAction.current).toEqual({
      kind: 'book',
      bookingId: 'bk-new',
      event: null,
      maybeId: null,
    });
  });

  // FAILS if the conversion sends a seed (which would create a second event), or if it tries
  // to migrate placeId itself instead of letting ADR-0048's server invariant do it.
  it('on an EXISTING event creates the booking with no seed, then patches bookingId', async () => {
    const calls = okFetch();
    const deps = fakeDeps();

    const applied = await applyBookEvent(deps, input, { event: unlinked });

    expect(applied).toMatchObject({ id: 'bk-new' });
    expect(deps.bookings.createBooking.mock.calls[0][0].event).toBeUndefined();
    const patch = calls.find((c) => c.url.includes(`/events/${unlinked.id}`));
    expect(patch?.method).toBe('PATCH');
    // Nothing here writes placeId: the server nulls it (ADR-0048).
    const updated = deps.actions.find((a) => a.type === TRIP_ACTION.UPDATE_EVENT);
    expect(updated).toMatchObject({ patch: { bookingId: 'bk-new' } });
    expect((updated as { patch: Record<string, unknown> }).patch.placeId).toBeUndefined();
  });

  // FAILS if the two writes do not undo as one: the descriptor has to be the composite, not
  // the `update` one `applyUpdateEvent` leaves behind on its way through.
  it('leaves ONE undo descriptor carrying the fields only it can restore', async () => {
    okFetch();
    const deps = fakeDeps();

    await applyBookEvent(deps, input, { event: unlinked });

    expect(deps.lastAction.current).toEqual({
      kind: 'book',
      bookingId: 'bk-new',
      event: {
        id: unlinked.id,
        previous: { placeId: unlinked.placeId, category: unlinked.category },
      },
      maybeId: null,
    });
  });

  // FAILS if a failed link leaves the booking behind — the half-applied conversion ADR-0136's
  // Consequences names, where a booking exists that nothing points at.
  it('deletes the booking when the link fails, rather than orphaning it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    const applied = await applyBookEvent(deps, input, { event: unlinked });

    // `null`, not `false`: a rolled-back write hands back no host, so a caller cannot
    // attach anything to it (the form's `writeNotesBehind` reads exactly this).
    expect(applied).toBeNull();
    expect(deps.bookings.deleteBooking).toHaveBeenCalledWith('bk-new', { deleteEvents: false });
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UNDO)).toBe(true);
    expect(deps.lastAction.current).toBeNull();
  });

  it('reports failure without touching the event when the booking itself fails', async () => {
    const deps = fakeDeps();
    deps.bookings.createBooking.mockRejectedValueOnce(new Error('nope'));

    expect(await applyBookEvent(deps, input)).toBeNull();
    expect(deps.actions).toEqual([]);
    expect(deps.lastAction.current).toBeNull();
  });

  // ADR-0135 §5: the booked path consumes the originating idea too, because a booking puts
  // something on the day exactly as scheduling does.
  it('consumes the originating idea, and folds it into the same undo', async () => {
    const calls = okFetch();
    const deps = fakeDeps();

    await applyBookEvent(
      deps,
      { ...input, event: { date: '2026-07-26' } },
      {
        maybeId: 'mb-skytree',
      },
    );

    expect(calls.some((c) => c.url.includes('/maybe-items/mb-skytree/consume'))).toBe(true);
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.CONSUME_MAYBE_ITEM)).toBe(true);
    expect(deps.lastAction.current).toMatchObject({ kind: 'book', maybeId: 'mb-skytree' });
  });

  describe('its undo', () => {
    it('takes the linked event with the booking on a create', async () => {
      okFetch();
      const deps = fakeDeps();
      deps.lastAction.current = {
        kind: 'book',
        bookingId: 'bk-new',
        event: null,
        maybeId: null,
      };

      await applyUndo(deps);

      // The event only ever existed because of the booking, so it goes too.
      expect(deps.bookings.deleteBooking).toHaveBeenCalledWith('bk-new', {
        deleteEvents: true,
        confirm: true,
      });
    });

    // FAILS if the undo deletes the pre-existing event, or if it restores the place BEFORE
    // deleting the booking — ADR-0048 would null it straight back out.
    it('keeps the converted event and hands its place and category back, in that order', async () => {
      const calls = okFetch();
      const deps = fakeDeps();
      let deletedAt = -1;
      deps.bookings.deleteBooking.mockImplementation(async () => {
        deletedAt = calls.length;
      });
      deps.lastAction.current = {
        kind: 'book',
        bookingId: 'bk-new',
        event: { id: unlinked.id, previous: { placeId: 'pl-ramen', category: 'food' } },
        maybeId: null,
      };

      await applyUndo(deps);

      expect(deps.bookings.deleteBooking).toHaveBeenCalledWith('bk-new', {
        deleteEvents: false,
        confirm: true,
      });
      const patchIndex = calls.findIndex((c) => c.url.includes(`/events/${unlinked.id}`));
      expect(patchIndex).toBeGreaterThanOrEqual(0);
      // The booking is gone before the place comes back, or the server re-nulls it.
      expect(deletedAt).toBeLessThanOrEqual(patchIndex);
      // A converted event may be hard by now, so the restore has to carry confirm.
      expect(calls[patchIndex].url).toContain('confirm=true');
    });

    // The same gap the schedule undo had, on the booked path: without the server-side restore
    // the idea came back locally and the next resync ate it again.
    it('puts the idea it consumed back on the shelf, server-side', async () => {
      const calls = okFetch();
      const deps = fakeDeps();
      deps.lastAction.current = {
        kind: 'book',
        bookingId: 'bk-new',
        event: null,
        maybeId: 'mb-skytree',
      };

      await applyUndo(deps);

      expect(calls.some((c) => c.url.includes('/maybe-items/mb-skytree/restore'))).toBe(true);
    });
  });
});

describe('applyConsumeMaybeItem (a consume with no event of its own, ADR-0135 §5)', () => {
  it('dispatches the standalone consume and persists it', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve(new Response(JSON.stringify(MAYBE_ITEMS[0]), { status: 200 }));
      }),
    );
    const deps = fakeDeps();

    await applyConsumeMaybeItem(deps, 'mb-skytree');

    expect(deps.actions).toEqual([{ type: TRIP_ACTION.CONSUME_MAYBE_ITEM, maybeId: 'mb-skytree' }]);
    expect(calls[0]).toContain('/maybe-items/mb-skytree/consume');
  });

  it('queues the consume when offline', async () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('navigator', { onLine: false });
    const deps = fakeDeps();

    await applyConsumeMaybeItem(deps, 'mb-skytree');

    expect((await db.outbox.toArray()).map((e) => e.op)).toEqual([
      { verb: OUTBOX_VERB.CONSUME_MAYBE_ITEM, maybeItemId: 'mb-skytree' },
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
    expect(deps.actions).toEqual([
      { type: TRIP_ACTION.SET_STATUS, id: event.id, status: EVENT_STATUS.DONE },
    ]); // no UNDO — the optimistic change is what's queued, not rolled back
    expect(deps.toast).not.toHaveBeenCalled();

    const queued = await db.outbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].op).toEqual({
      verb: OUTBOX_VERB.SET_STATUS,
      eventId: event.id,
      status: EVENT_STATUS.DONE,
    });
  });

  it('queues on a network failure (fetch throws) the same way as an explicit offline check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const deps = fakeDeps();

    await applyCreateEvent(deps, event);

    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UNDO)).toBe(false);
    expect(deps.toast).not.toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(1);
  });

  it('still rolls back and toasts on a real HTTP error while online (unaffected by the outbox)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    await applySetStatus(deps, event, EVENT_STATUS.DONE);

    expect(deps.actions[1]).toEqual({ type: TRIP_ACTION.UNDO });
    expect(deps.toast).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('applyEventPatches', () => {
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
    await applyEventPatches(deps, patches, [a, b]);

    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.REORDER, patches });
    expect(deps.actions.filter((x) => x.type === TRIP_ACTION.RECONCILE_EVENT)).toHaveLength(2);
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('rolls back and toasts on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applyEventPatches(deps, patches, [a, b]);
    expect(deps.actions.some((x) => x.type === TRIP_ACTION.UNDO)).toBe(true);
    expect(deps.toast).toHaveBeenCalled();
  });

  it('is a no-op with no patches', async () => {
    const deps = fakeDeps();
    await applyEventPatches(deps, [], [a, b]);
    expect(deps.actions).toHaveLength(0);
  });
});

// ── A CONVERSION CARRIES ITS NOTES (ADR-0152 §5's 2026-08-01 amendment) ─────────────────
//
// Three shipped conversions consume one entity into another, and every one of them used to
// leave the notes behind. Parking was the worst: it DELETES the event, and the note FKs are
// `onDelete: Cascade`, so the notes were destroyed rather than stranded. These tests are
// about WHICH host and IN WHAT ORDER, because both are what make it correct offline.
describe('carrying notes through a conversion', () => {
  const event = EVENTS.find((e) => e.id === 'ev-goldengai')!; // soft
  const idea = MAYBE_ITEMS[0];

  // The responses have to be REAL entities: every api fetcher parses what comes back, so a
  // `{}` throws inside the verb and the conversion never reaches its notes — which is how
  // the first draft of these tests failed for the wrong reason.
  const okFetch = () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        calls.push(u);
        const body = u.includes('/events')
          ? { ...EVENTS[0], ...JSON.parse(String(init?.body ?? '{}')) }
          : MAYBE_ITEMS[0];
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    return calls;
  };

  it('moves an idea’s notes onto the event it is scheduled into', async () => {
    okFetch();
    const notes = [noteOn('n1', { maybeItemId: idea.id }), noteOn('n2', { maybeItemId: idea.id })];
    const deps = fakeDeps(undefined, [...notes, noteOn('n3', { maybeItemId: 'mb-other' })]);
    const scheduled = { ...EVENTS[0], id: 'ev-scheduled' };

    await applySchedule(deps, scheduled, idea.id);

    expect(deps.notes.rehost).toHaveBeenCalledTimes(2);
    const [note, host] = deps.notes.rehost.mock.calls[0];
    expect(note.id).toBe('n1');
    // The new host set and every other one CLEARED, in the one write — a note claiming two
    // hosts is refused at the schema.
    expect(host).toEqual({
      eventId: 'ev-scheduled',
      bookingId: null,
      placeId: null,
      maybeItemId: null,
      documentId: null,
    });
  });

  // The ordering claim, and the one that makes parking safe: the notes must reach the idea
  // BEFORE the event's delete goes out, or the cascade takes them.
  it('moves an event’s notes to the shelf BEFORE the event is deleted', async () => {
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/maybe-items')) order.push('idea');
        if (u.includes('/events/')) order.push('delete');
        return new Response(JSON.stringify(u.includes('/events') ? EVENTS[0] : MAYBE_ITEMS[0]), {
          status: 200,
        });
      }),
    );
    const item = { ...idea, id: 'mb-parked' };
    const deps = fakeDeps(undefined, [noteOn('n1', { eventId: event.id })]);
    deps.notes.rehost.mockImplementation(async () => void order.push('note'));

    await applyPark(deps, event, item);

    expect(order).toEqual(['idea', 'note', 'delete']);
    expect(deps.notes.rehost.mock.calls[0][1]).toMatchObject({
      maybeItemId: 'mb-parked',
      eventId: null,
    });
  });

  // Undoing the schedule deletes the event again — so the notes have to ride back first, or
  // the undo destroys what the action itself preserved.
  it('carries the notes BACK when a schedule is undone', async () => {
    okFetch();
    const deps = fakeDeps(undefined, [noteOn('n1', { eventId: 'ev-scheduled' })]);
    deps.lastAction.current = { kind: 'create', id: 'ev-scheduled', maybeId: idea.id };

    await applyUndo(deps);

    expect(deps.notes.rehost).toHaveBeenCalledTimes(1);
    expect(deps.notes.rehost.mock.calls[0][1]).toMatchObject({
      maybeItemId: idea.id,
      eventId: null,
    });
  });

  // Un-parking deletes the IDEA, so the same rule applies mirrored: the event is re-created
  // first, the notes ride to it, and only then does the idea go.
  it('re-creates the event before carrying the notes back on an un-park', async () => {
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/events') && init?.method === 'POST') order.push('event');
        if (u.includes('/maybe-items/')) order.push('delete-idea');
        return new Response(JSON.stringify(u.includes('/events') ? EVENTS[0] : MAYBE_ITEMS[0]), {
          status: 200,
        });
      }),
    );
    const deps = fakeDeps(undefined, [noteOn('n1', { maybeItemId: 'mb-parked' })]);
    deps.notes.rehost.mockImplementation(async () => void order.push('note'));
    deps.lastAction.current = { kind: 'park', event, maybeId: 'mb-parked' };

    await applyUndo(deps);

    expect(order).toEqual(['event', 'note', 'delete-idea']);
  });

  it('leaves a host’s notes alone when nothing is converted', async () => {
    okFetch();
    const deps = fakeDeps(undefined, [noteOn('n1', { bookingId: 'bk-1' })]);
    await applySchedule(deps, { ...EVENTS[0], id: 'ev-x' }, idea.id);
    expect(deps.notes.rehost).not.toHaveBeenCalled();
  });
});

// ── AN UNDONE HOST DELETE PUTS ITS NOTES BACK (ADR-0152 §5's 2026-08-02 amendment) ──────
//
// The other half of the cascade, and the one a conversion cannot cover: deleting a host is
// not a conversion, so there is no new host to carry the notes to. Postgres destroys them,
// §2's applier rule drops them from memory and from Dexie, and `reverseRest` then re-creates
// the host with the same id and nothing else — an undo that silently kept less than it
// restored. The three claims below are the whole fix: the notes are READ at the delete (they
// are unreachable afterwards), the host is written BEFORE them (the FK), and nothing that was
// not hosted by it moves.
describe('undoing a host delete restores its cascaded notes', () => {
  const event = EVENTS.find((e) => e.id === 'ev-goldengai')!; // soft
  const idea = MAYBE_ITEMS[0];

  const okFetch = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const body = u.includes('/events')
          ? { ...EVENTS[0], ...JSON.parse(String(init?.body ?? '{}')) }
          : MAYBE_ITEMS[0];
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

  it('re-creates an event’s notes, with their own id and content', async () => {
    okFetch();
    const notes = [noteOn('n1', { eventId: event.id }), noteOn('n2', { eventId: event.id })];
    const deps = fakeDeps(undefined, [...notes, noteOn('n3', { eventId: 'ev-other' })]);

    await applyGuardedDelete(deps, event);
    await applyUndo(deps);

    expect(deps.notes.recreate.mock.calls.map((call) => call[0] as Note)).toEqual(notes);
  });

  // The load-bearing one. By the time undo runs the notes are gone from every list the app
  // holds — the §2 applier drops them the moment the delete echoes — so a fix that read the
  // live list at undo time would restore nothing at all and look right in a test that forgot
  // to empty it.
  it('reads the notes at the DELETE, not at the undo', async () => {
    okFetch();
    const deps = fakeDeps(undefined, [noteOn('n1', { eventId: event.id })]);

    await applyGuardedDelete(deps, event);
    deps.notes.list = []; // what `dropNotesForHostChange` has already done by now
    await applyUndo(deps);

    expect(deps.notes.recreate).toHaveBeenCalledTimes(1);
  });

  // **ADR-0173 §7's other half.** A cascade takes the document LINKS as silently as it takes
  // the notes, so an undo that re-created only the event would restore less than it took —
  // and the documents themselves were never at risk, which is exactly why what comes back is
  // the pointers.
  it('re-creates an event’s document links, under their own ids', async () => {
    okFetch();
    const links = [linkOn('at1', event.id), linkOn('at2', event.id)];
    const deps = fakeDeps(undefined, [], [...links, linkOn('at3', 'ev-other')]);

    await applyGuardedDelete(deps, event);
    await applyUndo(deps);

    expect(deps.attachments.recreate.mock.calls.map((call) => call[0])).toEqual(links);
  });

  // Same load-bearing case as the notes one above, for the same reason: by undo time
  // `dropAttachmentsForHostChange` has already emptied the list.
  it('reads the links at the DELETE, not at the undo', async () => {
    okFetch();
    const deps = fakeDeps(undefined, [], [linkOn('at1', event.id)]);

    await applyGuardedDelete(deps, event);
    deps.attachments.list = [];
    await applyUndo(deps);

    expect(deps.attachments.recreate).toHaveBeenCalledTimes(1);
  });

  it('re-creates the event before its notes, so the host FK resolves', async () => {
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/events') && init?.method === 'POST') order.push('event');
        return new Response(JSON.stringify(EVENTS[0]), { status: 200 });
      }),
    );
    const deps = fakeDeps(undefined, [noteOn('n1', { eventId: event.id })]);
    deps.notes.recreate.mockImplementation(async () => void order.push('note'));

    await applyGuardedDelete(deps, event);
    await applyUndo(deps);

    expect(order).toEqual(['event', 'note']);
  });

  it('re-creates the event before its links too, for the same FK reason', async () => {
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/events') && init?.method === 'POST') order.push('event');
        return new Response(JSON.stringify(EVENTS[0]), { status: 200 });
      }),
    );
    const deps = fakeDeps(undefined, [], [linkOn('at1', event.id)]);
    deps.attachments.recreate.mockImplementation(async () => void order.push('link'));

    await applyGuardedDelete(deps, event);
    await applyUndo(deps);

    expect(order).toEqual(['event', 'link']);
  });

  it('restores an idea’s notes when its removal is undone', async () => {
    okFetch();
    const deps = fakeDeps(undefined, [
      noteOn('n1', { maybeItemId: idea.id }),
      noteOn('n2', { maybeItemId: 'mb-other' }),
    ]);

    await applyRemoveMaybe(deps, idea);
    await applyUndo(deps);

    expect(deps.notes.recreate.mock.calls.map((call) => (call[0] as Note).id)).toEqual(['n1']);
  });

  it('restores nothing when the deleted host carried no notes', async () => {
    okFetch();
    const deps = fakeDeps(undefined, [noteOn('n1', { bookingId: 'bk-1' })]);

    await applyGuardedDelete(deps, event);
    await applyUndo(deps);

    expect(deps.notes.recreate).not.toHaveBeenCalled();
  });
});

// The (a) half on the one host whose delete confirm the verbs own: a hard event's gate is
// reached from here, so the count it names has to be counted here (ADR-0152 §2).
describe('the hard-event delete gate names the notes the cascade will take', () => {
  const hardEvent = EVENTS.find((e) => e.id === 'ev-ichiran')!;

  it('passes the host’s note count to the confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const confirmHardEdit = vi.fn().mockResolvedValue(true);
    const deps = fakeDeps(confirmHardEdit, [
      noteOn('n1', { eventId: hardEvent.id }),
      noteOn('n2', { eventId: hardEvent.id }),
      noteOn('n3', { eventId: 'ev-other' }),
    ]);

    await applyGuardedDelete(deps, hardEvent);

    expect(confirmHardEdit).toHaveBeenCalledWith(hardEvent, 'delete', { notes: 2 });
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

    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.PARK_EVENT, eventId: event.id, item });
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UNDO)).toBe(false);
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
  // ADR-0116 §4: parking is "not in this slot", not "not this day" — and it used to
  // drop the category, so a parked restaurant came back uncategorised.
  it('sends the category and the day the event was on', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(new Response(JSON.stringify(item), { status: 201 }));
      }),
    );
    const withFacets = { ...item, category: 'food' as const, targetDate: event.date };

    await applyPark(fakeDeps(), event, withFacets);

    expect(bodies[0]).toEqual(
      expect.objectContaining({ category: 'food', targetDate: event.date }),
    );
  });

  it('rolls back and toasts when the create fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    await applyPark(deps, event, item);

    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.PARK_EVENT, eventId: event.id, item });
    expect(deps.actions.at(-1)).toEqual({ type: TRIP_ACTION.UNDO });
    expect(deps.toast).toHaveBeenCalledTimes(1);
  });
});

// **`החלף` is one decision** (ADR-0161 §6). It used to `skip` the event and post a toast
// telling you to go and find a replacement yourself — so the slot was emptied and the verb
// left. What this file pins is the two things that make the new one honest: ONE reducer action
// (two would take two undo snapshots, and the second would capture a day the first already
// emptied), and an undo that reverses both halves.
describe('applyReplace (החלף, taken on the slot)', () => {
  const displaced = EVENTS.find((e) => e.id === 'ev-goldengai')!; // soft
  const parked = {
    id: 'mb-displaced',
    tripId: 'trip-japan-26',
    title: displaced.title,
    icon: displaced.icon,
    createdBy: 'u-assaf',
    consumed: false,
    createdAt: 'now',
    updatedAt: 'now',
    updatedBy: 'u-assaf',
  };
  /** The replacement, already built on the displaced event's own slot — which is the rule
   *  the verb wrapper applies and this asserts is what arrives. */
  const replacement = {
    ...displaced,
    id: 'ev-replacement',
    title: 'אודן קאשימה',
  };

  /** Answers each write with a body of the right SHAPE — the responses are parsed, so an
   *  event handed back from `/maybe-items` is refused and the whole verb rolls back. */
  const ok = (calls: Array<{ url: string; method?: string }>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const href = String(url);
        calls.push({ url: href, method: init?.method });
        const body = href.includes('/maybe-items') ? parked : replacement;
        return Promise.resolve(new Response(JSON.stringify(body), { status: 201 }));
      }),
    );

  it('dispatches exactly ONE action, so the undo snapshot spans both halves', async () => {
    ok([]);
    const deps = fakeDeps();

    await applyReplace(deps, displaced, parked, replacement, 'mb-chosen');

    expect(deps.actions.filter((a) => a.type === TRIP_ACTION.REPLACE_EVENT)).toEqual([
      {
        type: TRIP_ACTION.REPLACE_EVENT,
        displacedId: displaced.id,
        parked,
        event: replacement,
        maybeId: 'mb-chosen',
      },
    ]);
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.PARK_EVENT)).toBe(false);
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.SCHEDULE)).toBe(false);
  });

  it('parks the displaced event, then creates the replacement and consumes its idea', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    ok(calls);

    await applyReplace(fakeDeps(), displaced, parked, replacement, 'mb-chosen');

    const trail = calls.map((c) => `${c.method ?? 'GET'} ${c.url.replace(/^.*\/trips/, '')}`);
    // The park's two writes first — the idea has to exist before the event goes, or the note
    // cascade destroys what parking is meant to carry — then the replacement's create and the
    // chosen idea's consume.
    expect(trail[0]).toContain('/maybe-items');
    expect(trail[1]).toContain(`DELETE`);
    expect(trail[1]).toContain(displaced.id);
    expect(trail[2]).toContain('/events');
    expect(trail.at(-1)).toContain('mb-chosen');
  });

  it('leaves ONE undo descriptor carrying both halves', async () => {
    ok([]);
    const deps = fakeDeps();

    await applyReplace(deps, displaced, parked, replacement, 'mb-chosen');

    expect(deps.lastAction.current).toEqual({
      kind: 'replace',
      park: { event: displaced, maybeId: parked.id },
      created: { id: replacement.id, maybeId: 'mb-chosen' },
    });
  });

  it('undoing it deletes the replacement, restores its idea, and puts the event back', async () => {
    ok([]);
    const deps = fakeDeps();
    await applyReplace(deps, displaced, parked, replacement, 'mb-chosen');

    const calls: Array<{ url: string; method?: string }> = [];
    ok(calls);
    await applyUndo(deps);

    const trail = calls.map((c) => `${c.method ?? 'GET'} ${c.url}`);
    // The schedule half unwinds FIRST: the replacement's delete cascades, so its notes have to
    // reach the idea it came from while that idea still exists.
    expect(trail[0]).toContain(replacement.id);
    expect(trail[0]).toContain('DELETE');
    expect(trail.some((c) => c.includes('mb-chosen') && c.includes('restore'))).toBe(true);
    // …and only then is the displaced event re-created and its parked idea dropped.
    const recreate = trail.findIndex((c) => c.startsWith('POST') && c.endsWith('/events'));
    const dropIdea = trail.findIndex((c) => c.includes('DELETE') && c.includes(parked.id));
    expect(recreate).toBeGreaterThan(-1);
    expect(dropIdea).toBeGreaterThan(recreate);
  });

  it('rolls back and toasts when a write fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();

    await applyReplace(deps, displaced, parked, replacement, 'mb-chosen');

    expect(deps.actions[0].type).toBe(TRIP_ACTION.REPLACE_EVENT);
    expect(deps.actions.at(-1)).toEqual({ type: TRIP_ACTION.UNDO });
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
    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.ADD_MAYBE, item });
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UNDO)).toBe(false);
  });

  it('rolls back the optimistic add and toasts on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applyAddMaybe(deps, item);
    expect(deps.actions.at(-1)).toEqual({ type: TRIP_ACTION.UNDO });
    expect(deps.toast).toHaveBeenCalled();
  });

  it('removes optimistically and DELETEs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const deps = fakeDeps();
    await applyRemoveMaybe(deps, item);
    expect(deps.actions[0]).toEqual({ type: TRIP_ACTION.REMOVE_MAYBE, id: item.id });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/maybe-items/${item.id}`),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rolls back the optimistic remove on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const deps = fakeDeps();
    await applyRemoveMaybe(deps, item);
    expect(deps.actions.at(-1)).toEqual({ type: TRIP_ACTION.UNDO });
    expect(deps.toast).toHaveBeenCalled();
  });
});

// ADR-0116 §2 amendment: dragging an idea between the shelf's two groups re-aims
// its day. A pencil mark — `consumed` is untouched, so it stays parked.
describe('applySetMaybeDay (re-aim an idea at a day)', () => {
  const item = {
    id: 'mb-idea',
    tripId: 'trip-japan-26',
    title: 'רעיון',
    createdBy: 'u-assaf',
    consumed: false,
    createdAt: 'now',
    updatedAt: 'now',
    updatedBy: 'u-assaf',
  };

  const capture = () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return Promise.resolve(new Response(JSON.stringify(item), { status: 200 }));
      }),
    );
    return calls;
  };

  it('PATCHes the target day and patches local state optimistically', async () => {
    const calls = capture();
    const deps = fakeDeps();

    await applySetMaybeDay(deps, item, '2026-07-20');

    expect(deps.actions[0]).toEqual({
      type: TRIP_ACTION.UPDATE_MAYBE,
      id: item.id,
      patch: { targetDate: '2026-07-20' },
    });
    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UNDO)).toBe(false);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain(`/maybe-items/${item.id}`);
    expect(calls[0].body).toEqual({ targetDate: '2026-07-20' });
  });

  it('clears the day back to "someday" with null', async () => {
    const calls = capture();
    await applySetMaybeDay(fakeDeps(), { ...item, targetDate: '2026-07-20' }, null);
    expect(calls[0].body).toEqual({ targetDate: null });
  });

  it('rolls back and toasts when the write fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    );
    const deps = fakeDeps();

    await applySetMaybeDay(deps, item, '2026-07-20');

    expect(deps.actions.some((a) => a.type === TRIP_ACTION.UNDO)).toBe(true);
    expect(deps.toast).toHaveBeenCalled();
  });
});

// ── ADR-0157: AN UNDONE PLACE DELETE PUTS BACK EVERYTHING THE DATABASE TOOK ──────────────
//
// A place delete is the widest cascade in the app: `SetNull` on four FKs, `Cascade` on the
// notes, and NEITHER writes a `Change` row. So the descriptor captured at the delete is the
// only surviving record of both, and these are the four claims that make the undo honest —
// the place comes back first (everything else FK-references it), the links are handed back
// through the writer that owns each store, the notes are written home, and a row that never
// pointed here is not touched on the way.
describe('undoing a place delete', () => {
  const place = {
    id: 'pl-shibuya',
    tripId: 'trip-japan-26',
    name: 'שיבויה',
    lat: 35.6595,
    lng: 139.7005,
    icon: '🍜',
    rating: 4.4,
    userRatingsTotal: 1820,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  } as Place;

  // Route-aware, like the host-delete suite's: a maybe-item POST is parsed against
  // `maybeItemSchema`, so answering it with an event makes the undo throw where the real
  // one succeeds — and a swallowed undo error looks exactly like a restore that did nothing.
  const okFetch = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/maybe-items')
          ? new Response(JSON.stringify(MAYBE_ITEMS[0]), { status: 200 })
          : new Response(JSON.stringify(EVENTS[0]), { status: 200 }),
      ),
    );

  const withLinks = (links: PlaceLink[], notes: Note[] = []) => {
    const deps = fakeDeps(undefined, notes);
    deps.places.deletePlace.mockResolvedValue(links);
    return deps;
  };

  it('re-creates the place under its own id, with the two numbers only it can restore', async () => {
    okFetch();
    const deps = withLinks([]);

    await applyDeletePlace(deps, place);
    await applyUndo(deps);

    expect(deps.places.createPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: place.id,
        name: 'שיבויה',
        icon: '🍜',
        rating: 4.4,
        userRatingsTotal: 1820,
      }),
    );
    // The zone is re-derived from the coordinates server-side, so it is deliberately absent.
    expect(deps.places.createPlace.mock.calls[0][0]).not.toHaveProperty('timezone');
  });

  it('hands every FK back, through the writer that owns each store', async () => {
    const patched: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH')
          patched.push({ url: String(url), body: JSON.parse(String(init.body ?? '{}')) });
        return new Response(JSON.stringify(EVENTS[0]), { status: 200 });
      }),
    );
    const deps = withLinks([
      { owner: 'event', id: 'ev-1', fields: ['placeId'] },
      { owner: 'booking', id: 'bk-1', fields: ['fromPlaceId', 'toPlaceId'] },
      { owner: 'maybeItem', id: 'mb-1', fields: ['placeId'] },
    ]);

    await applyDeletePlace(deps, place);
    await applyUndo(deps);

    // A booking is not in the reducer's snapshot, so its re-link goes through the verb that
    // owns its optimistic state — and both of a round trip's ends come back in one patch.
    expect(deps.bookings.updateBooking).toHaveBeenCalledWith('bk-1', {
      fromPlaceId: place.id,
      toPlaceId: place.id,
    });
    expect(patched.map((p) => p.body)).toEqual([{ placeId: place.id }, { placeId: place.id }]);
    expect(patched.some((p) => p.url.includes('/events/ev-1'))).toBe(true);
    expect(patched.some((p) => p.url.includes('/maybe-items/mb-1'))).toBe(true);
  });

  it('re-creates the place BEFORE its links and its notes, so every FK resolves', async () => {
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') order.push('link');
        return new Response(JSON.stringify(EVENTS[0]), { status: 200 });
      }),
    );
    const deps = withLinks(
      [{ owner: 'event', id: 'ev-1', fields: ['placeId'] }],
      [noteOn('n1', { placeId: place.id })],
    );
    deps.places.createPlace.mockImplementation(async () => {
      order.push('place');
      return place.id;
    });
    deps.notes.recreate.mockImplementation(async () => void order.push('note'));

    await applyDeletePlace(deps, place);
    await applyUndo(deps);

    expect(order).toEqual(['place', 'link', 'note']);
  });

  // Same load-bearing claim as the host-delete suite above: by undo time the notes are gone
  // from every list the client holds, so they must have been read at the delete.
  it('restores the place’s own notes, read at the delete and no one else’s', async () => {
    okFetch();
    const mine = noteOn('n1', { placeId: place.id });
    const deps = withLinks([], [mine, noteOn('n2', { placeId: 'pl-other' })]);

    await applyDeletePlace(deps, place);
    deps.notes.list = []; // what the applier rule has already done by now
    await applyUndo(deps);

    expect(deps.notes.recreate.mock.calls.map((call) => call[0] as Note)).toEqual([mine]);
  });

  // ── ADR-0157 §9: THE SOLE SHELF IDEA GOES WITH THE PLACE ────────────────────
  // Reported by the owner: add a place, delete it a second later, and a shelf idea nobody
  // typed is left behind with no location — because every add creates one (`landPlace`). One
  // live idea IS that place's intention, which is ADR-0135 §5's consume-on-schedule rule read
  // from the other end; two or more are two intentions and none are touched.
  describe('the sole shelf idea', () => {
    const idea = { ...MAYBE_ITEMS[0], id: 'mb-sole', placeId: place.id } as MaybeItem;

    it('is deleted with the place, and is NOT reported as a surviving link', async () => {
      okFetch();
      const deps = withLinks([{ owner: 'maybeItem', id: idea.id, fields: ['placeId'] }]);

      await applyDeletePlace(deps, place, idea);

      expect(deps.places.deletePlace).toHaveBeenCalledWith(place.id, { ideaId: idea.id });
      // The write layer filters it out of the links it returns; the descriptor carries it as
      // a deletion instead, which is what makes the undo re-CREATE rather than re-point it.
      const desc = deps.lastAction.current as { idea: { item: MaybeItem } | null };
      expect(desc.idea?.item.id).toBe(idea.id);
    });

    it('comes back on undo, under its own id and pointed at the place again', async () => {
      const posted: unknown[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          const isMaybe = String(url).includes('/maybe-items');
          if (isMaybe && init?.method === 'POST')
            posted.push(JSON.parse(String(init.body ?? '{}')));
          return new Response(JSON.stringify(isMaybe ? MAYBE_ITEMS[0] : EVENTS[0]), {
            status: 200,
          });
        }),
      );
      const deps = withLinks([]);

      await applyDeletePlace(deps, place, idea);
      await applyUndo(deps);

      expect(posted).toEqual([
        expect.objectContaining({ id: idea.id, title: idea.title, placeId: place.id }),
      ]);
    });

    it('takes its own notes with it, and gives them back', async () => {
      okFetch();
      const ideaNote = noteOn('n-idea', { maybeItemId: idea.id });
      const deps = withLinks([], [ideaNote, noteOn('n-place', { placeId: place.id })]);

      await applyDeletePlace(deps, place, idea);
      deps.notes.list = []; // what the applier rule has already done by now
      await applyUndo(deps);

      expect(deps.notes.recreate.mock.calls.map((call) => (call[0] as Note).id)).toEqual([
        'n-idea',
        'n-place',
      ]);
    });

    // The caller decides; passing nothing means nothing is swallowed, which is the two-ideas
    // case and the errand case both.
    it('is left alone when the caller passes none', async () => {
      okFetch();
      const deps = withLinks([]);

      await applyDeletePlace(deps, place);

      expect(deps.places.deletePlace).toHaveBeenCalledWith(place.id, { ideaId: undefined });
      expect((deps.lastAction.current as { idea: unknown }).idea).toBeNull();
    });
  });

  it('leaves no undo behind when the write failed', async () => {
    okFetch();
    const deps = withLinks([]);
    deps.places.deletePlace.mockRejectedValue(new Error('offline-ish'));

    expect(await applyDeletePlace(deps, place)).toBe(false);
    expect(deps.lastAction.current).toBeNull();
    await applyUndo(deps);
    expect(deps.places.createPlace).not.toHaveBeenCalled();
  });
});
