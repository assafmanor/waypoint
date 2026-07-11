import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSnapshot } from './api';
import { TRIP } from '../fixtures';

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
