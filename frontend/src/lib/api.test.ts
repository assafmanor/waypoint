import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
import {
  ApiError,
  apiFetch,
  createEvent,
  createInvite,
  createTrip,
  deleteEvent,
  fetchSnapshot,
  isHardEventConfirmError,
  isMoveCrossesDayError,
  isMoveIntoPastError,
  moveEvent,
  refreshAccessToken,
  setAccessToken,
  setEventStatus,
  setOnSessionExpired,
} from './api';
import { EVENTS, TRIP } from '../fixtures';

const snapshotBody = {
  trip: TRIP,
  members: [],
  users: [],
  events: [],
  bookings: [],
  maybeItems: [],
  notes: [],
  latestSeq: '0',
};

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setOnSessionExpired(null);
});

describe('apiFetch 401 → silent refresh (ADR-0020: 15-min access JWT)', () => {
  it('retries once through /auth/refresh and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'new-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/x');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up and reports the expired session when refresh also fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const onExpired = vi.fn();
    setOnSessionExpired(onExpired);

    const res = await apiFetch('/x');
    expect(res.status).toBe(401);
    expect(onExpired).toHaveBeenCalledOnce();
  });
});

describe('refreshAccessToken coalescing (ADR-0020: rotating refresh token)', () => {
  it('collapses concurrent calls into a single POST /auth/refresh', async () => {
    // The token rotates on every use, so overlapping refreshes would race and
    // corrupt the session (StrictMode double-mount, simultaneous 401 retries).
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = [refreshAccessToken(), refreshAccessToken(), refreshAccessToken()];
    resolveFetch(new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 }));

    expect(await Promise.all([a, b, c])).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh request once the in-flight one settles', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await refreshAccessToken();
    await refreshAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchSnapshot', () => {
  it('parses a valid snapshot response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshotBody), { status: 200 })),
    );
    const snapshot = await fetchSnapshot(TRIP.id);
    expect(snapshot.trip.id).toBe(TRIP.id);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/snapshot`),
      expect.objectContaining({ credentials: 'include' }),
    );
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

describe('createTrip', () => {
  it('posts the input and returns the canonical trip', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(TRIP), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createTrip({
      name: TRIP.name,
      destination: TRIP.destination,
      startDate: TRIP.startDate,
      endDate: TRIP.endDate,
      timezone: TRIP.timezone,
    });
    expect(result.id).toBe(TRIP.id);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/trips'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('createInvite', () => {
  it('posts to /trips/:id/invite and returns the invite url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ inviteUrl: '/join/tok123' }), { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await createInvite(TRIP.id);
    expect(result.inviteUrl).toBe('/join/tok123');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/invite`),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(createInvite(TRIP.id)).rejects.toThrow();
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
    const rippleSuggestion = {
      movedTitle: 'x',
      direction: 'later',
      candidates: [{ id: 'ev-1', startsAt: 'y' }],
    };
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
