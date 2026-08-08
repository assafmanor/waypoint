import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STATUS } from '@waypoint/shared';
import {
  ApiError,
  apiFetch,
  createBooking,
  createEvent,
  createInvite,
  createPlace,
  createTrip,
  deleteBooking,
  deleteEvent,
  fetchDocumentContent,
  fetchSnapshot,
  isHardEventConfirmError,
  isMoveCrossesDayError,
  isMoveIntoPastError,
  lookupEnrichment,
  moveEvent,
  refreshAccessToken,
  resolveDestination,
  searchDestinations,
  setAccessToken,
  setEventStatus,
  setOnSessionExpired,
  updateBooking,
  updatePlace,
} from './api';
import { BOOKINGS, EVENTS, TRIP } from '../fixtures';
import { DOC_READ_TIMEOUT_MS } from '../constants';
import { PhaseTimeoutError } from './deadline';

const snapshotBody = {
  trip: TRIP,
  members: [],
  users: [],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  notes: [],
  enrichments: {},
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

const booking = BOOKINGS[0];
const place = {
  id: 'pl-1',
  tripId: TRIP.id,
  name: 'Tokyo Station',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  updatedBy: 'u1',
};

describe('booking + place write calls', () => {
  it('createBooking posts the input to /bookings and parses the returned booking', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booking), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createBooking(TRIP.id, { type: booking.type, title: booking.title });
    expect(result.id).toBe(booking.id);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/bookings`),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updateBooking patches /bookings/:id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(booking), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await updateBooking(TRIP.id, booking.id, { title: 'x' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/bookings/${booking.id}`),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deleteBooking builds the confirm + deleteEvents query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteBooking(TRIP.id, booking.id, { confirm: true, deleteEvents: true });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('confirm=true');
    expect(url).toContain('deleteEvents=true');
  });

  it('deleteBooking (unlink default) sends no query string and tolerates 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteBooking(TRIP.id, booking.id)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).not.toContain('?');
  });

  it('deleteBooking surfaces a hard-event 409 as the confirm error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'HARD_EVENT_REQUIRES_CONFIRM', message: 'c' } }),
            { status: 409 },
          ),
        ),
    );
    await expect(deleteBooking(TRIP.id, booking.id)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && isHardEventConfirmError(err),
    );
  });

  it('createPlace posts to /places and parses the returned place', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(place), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createPlace(TRIP.id, { name: place.name });
    expect(result.id).toBe(place.id);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/places`),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updatePlace patches /places/:id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(place), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await updatePlace(TRIP.id, place.id, { name: 'y' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/places/${place.id}`),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

// **The one enrichment read a client ASKS for** (ADR-0166 §17). Everything else the pipe delivers
// rides the snapshot or a WS nudge, both keyed by `placeId` — a place nobody has added has none.
describe('enrichment lookup for a place we have not added', () => {
  const candidate = { googlePlaceId: 'ChIJ-sky', name: 'Tokyo Skytree', lat: 35.71, lng: 139.81 };

  it('posts the identity to the trip-scoped route and parses the read model', async () => {
    const image = {
      url: '/enrichment/images/enr_1',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      sizeBytes: 1000,
      source: 'commons',
      license: 'CC BY-SA 4.0',
      attribution: 'Kakidai',
      fetchedAt: '2026-08-05T09:00:00Z',
      confidence: 1,
      method: 'settled_id',
      ref: 'Skytree.jpg',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ image }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const fields = await lookupEnrichment(TRIP.id, candidate);
    expect(fields.image?.url).toBe(image.url);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/trips/${TRIP.id}/enrichment/lookup`),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(candidate) }),
    );
  });

  // An empty payload is the MAJORITY answer (ADR-0166 §11.3), not an error — 0 of 7 Tokyo
  // restaurants had an image. The caller renders it as the row it always was.
  it('parses an empty answer as an answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(lookupEnrichment(TRIP.id, candidate)).resolves.toEqual({});
  });

  it('throws on a refusal, so the caller can decide to say nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    await expect(lookupEnrichment(TRIP.id, candidate)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('destination lookup (ADR-0113, trip-agnostic)', () => {
  it('searchDestinations posts to /destinations/search and parses predictions', async () => {
    const predictions = [{ googlePlaceId: 'g-jp', primaryText: 'Japan', secondaryText: '' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(predictions), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchDestinations({ input: 'jap', sessionToken: 'tok' });
    expect(result[0].googlePlaceId).toBe('g-jp');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/destinations/search'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('resolveDestination posts to /destinations/resolve and parses the result', async () => {
    const body = {
      googlePlaceId: 'g-jp',
      name: 'Japan',
      countryCode: 'JP',
      lat: 36,
      lng: 138,
      timezone: 'Asia/Tokyo',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await resolveDestination({ googlePlaceId: 'g-jp', sessionToken: 'tok' });
    expect(result.timezone).toBe('Asia/Tokyo');
    expect(result.countryCode).toBe('JP');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/destinations/resolve'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ── Field-report #20: the document read used to have no bounded failure ────────────────
// Every await in `fetchDocumentContent` was unbounded, and the viewer's only route out of
// its spinner is a rejection — so any phase going quiet was a spinner that outlived the
// screen and was recoverable only by restarting the app. These pin the bounds: the read
// always ENDS, and it ends late enough that a slow-but-working read is never cut off.
describe('fetchDocumentContent — every phase is bounded (field-report #20)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const NEVER = new Promise<never>(() => {});
  const state = (p: Promise<unknown>) => {
    let done = false;
    const guarded = p.then(
      (v) => {
        done = true;
        return { ok: true as const, v };
      },
      (e: unknown) => {
        done = true;
        return { ok: false as const, e };
      },
    );
    return { guarded, settled: () => done };
  };

  /** A Cache API whose calls behave as asked. Absent by default in jsdom, so only the
   *  tests that want one install it. */
  function stubCaches(over: Partial<Record<'match' | 'put' | 'keys', () => Promise<unknown>>>) {
    const cache = {
      match: over.match ?? (() => Promise.resolve(undefined)),
      put: over.put ?? (() => Promise.resolve()),
      keys: over.keys ?? (() => Promise.resolve([])),
      delete: () => Promise.resolve(true),
    };
    vi.stubGlobal('caches', {
      open: () => Promise.resolve(cache),
      delete: () => Promise.resolve(true),
    });
  }

  it('a network fetch that never answers ends in a rejection, not a pending promise', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => NEVER),
    );
    const { guarded, settled } = state(fetchDocumentContent('t1', 'd1', 'v1'));

    await vi.advanceTimersByTimeAsync(DOC_READ_TIMEOUT_MS.FETCH - 1);
    expect(settled()).toBe(false); // a slow read is still a read

    await vi.advanceTimersByTimeAsync(1);
    const result = await guarded;
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.e).toBeInstanceOf(PhaseTimeoutError);
  });

  it('aborts the request it gave up on rather than leaving it open', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => NEVER);
    vi.stubGlobal('fetch', fetchMock);
    const { guarded } = state(fetchDocumentContent('t1', 'd1', 'v1'));
    await vi.advanceTimersByTimeAsync(DOC_READ_TIMEOUT_MS.FETCH);
    await guarded;
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it('a response whose BODY never arrives ends in a rejection too', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, blob: () => NEVER })),
    );
    const { guarded, settled } = state(fetchDocumentContent('t1', 'd1', 'v1'));
    await vi.advanceTimersByTimeAsync(DOC_READ_TIMEOUT_MS.BODY - 1);
    expect(settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await guarded).ok).toBe(false);
  });

  // The Cache API sits AHEAD of the network, so a jammed storage handle wedged the first
  // open and the cached one alike. It is an optimization, so silence there is a miss.
  it('a cache read that never answers falls through to the network', async () => {
    vi.useFakeTimers();
    stubCaches({ match: () => NEVER });
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['net'])) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { guarded } = state(fetchDocumentContent('t1', 'd1', 'v1'));
    await vi.advanceTimersByTimeAsync(DOC_READ_TIMEOUT_MS.CACHE);
    const result = await guarded;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  // The bytes are already in hand here: the read has succeeded and only the write-through
  // is stuck, so nothing about it may reach the user.
  it('a cache WRITE that never answers does not hold up the blob already fetched', async () => {
    stubCaches({ put: () => NEVER, keys: () => NEVER });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['net'])) }),
      ),
    );
    // No timer advancing at all: this must resolve on its own, with real clocks running.
    await expect(fetchDocumentContent('t1', 'd1', 'v1')).resolves.toBeInstanceOf(Blob);
  });

  it('still serves a healthy cache hit without touching the network', async () => {
    stubCaches({
      match: () => Promise.resolve({ blob: () => Promise.resolve(new Blob(['hit'])) }),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchDocumentContent('t1', 'd1', 'v1')).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
