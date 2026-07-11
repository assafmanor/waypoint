import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
import {
  ApiError,
  createEvent,
  deleteEvent,
  fetchSnapshot,
  isHardEventConfirmError,
  isMoveCrossesDayError,
  isMoveIntoPastError,
  moveEvent,
  setEventStatus,
} from './api';
import { EVENTS, TRIP } from '../fixtures';

const snapshotBody = {
  trip: TRIP,
  members: [],
  events: [],
  bookings: [],
  maybeItems: [],
  notes: [],
  latestSeq: '0',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSnapshot', () => {
  it('parses a valid snapshot response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshotBody), { status: 200 })),
    );
    const snapshot = await fetchSnapshot(TRIP.id);
    expect(snapshot.trip.id).toBe(TRIP.id);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/trips/${TRIP.id}/snapshot`));
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(fetchSnapshot(TRIP.id)).rejects.toThrow('404');
  });

  it('throws on a malformed response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 })),
    );
    await expect(fetchSnapshot(TRIP.id)).rejects.toThrow();
  });
});

const event = EVENTS[0];

describe('event write calls', () => {
  it('setEventStatus posts to /status and parses the returned event', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(event), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await setEventStatus(TRIP.id, event.id, EVENT_STATUS.DONE);
    expect(result.id).toBe(event.id);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/events/${event.id}/status`),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('moveEvent parses the event + optional rippleSuggestion', async () => {
    const rippleSuggestion = { movedTitle: 'x', candidates: [{ id: 'ev-1', startsAt: 'y' }] };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ event, rippleSuggestion }), { status: 200 }),
        ),
    );
    const result = await moveEvent(TRIP.id, event.id, { startsAt: '2026-07-05T10:00:00Z' });
    expect(result.event.id).toBe(event.id);
    expect(result.rippleSuggestion).toEqual(rippleSuggestion);
  });

  it('createEvent posts the input and returns the canonical event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(event), { status: 200 })),
    );
    const result = await createEvent(TRIP.id, {
      date: event.date,
      title: event.title,
      kind: event.kind,
      source: event.source,
    });
    expect(result.id).toBe(event.id);
  });

  it('deleteEvent tolerates a 404 (already gone)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(deleteEvent(TRIP.id, event.id)).resolves.toBeUndefined();
  });

  it('a 409 HARD_EVENT_REQUIRES_CONFIRM parses into a distinguishable ApiError', async () => {
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
    await expect(setEventStatus(TRIP.id, event.id, EVENT_STATUS.DONE)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && isHardEventConfirmError(err),
    );
  });

  it('a generic 500 is not mistaken for the hard-confirm error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(setEventStatus(TRIP.id, event.id, EVENT_STATUS.DONE)).rejects.toSatisfy(
      (err: unknown) => !isHardEventConfirmError(err),
    );
  });

  it('a 409 MOVE_INTO_PAST parses into a distinguishable ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'MOVE_INTO_PAST', message: 'past' } }), {
          status: 409,
        }),
      ),
    );
    await expect(moveEvent(TRIP.id, event.id, { startsAt: event.startsAt })).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && isMoveIntoPastError(err),
    );
  });

  it('a 409 MOVE_CROSSES_DAY parses into a distinguishable ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'MOVE_CROSSES_DAY', message: 'day' } }), {
          status: 409,
        }),
      ),
    );
    await expect(moveEvent(TRIP.id, event.id, { startsAt: event.startsAt })).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && isMoveCrossesDayError(err),
    );
  });
});
