// **Which failure was it** (ADR-0213's seventeenth amendment). The reader page draws one of
// three cards off `shareLoadFailure`, and only one of them tells a reader their link is gone
// — so the boundary between `404` and every other way a read can fail is the whole subject
// of this file. It shipped without one, which is how a deploy's few seconds of 502 came to
// read as `יכול להיות שהלינק בוטל`.
import { describe, expect, it, vi } from 'vitest';
import {
  fetchSharedItinerary,
  SHARE_LOAD_FAILURE,
  shareLoadFailure,
  SharedItineraryUnavailable,
  SharedItineraryUnreadable,
} from './share-itinerary';

const CODE = '7Kq2mB9x';

/** Enough of a projection to reach the parse and pass it. */
const projection = {
  status: 'live',
  detailLevel: 'summary',
  generatedAt: '2026-08-29T08:10:00.000Z',
  shareUrl: `/s/${CODE}`,
  trip: {
    name: 'איסלנד עם המשפחה',
    destination: 'Iceland',
    icon: '🇮🇸',
    startDate: '2026-08-29',
    endDate: '2026-08-30',
    timezone: 'Atlantic/Reykjavik',
    dayCount: 1,
    eventCount: 0,
    routeLabels: [],
    routeStopCount: 0,
    shape: 'base',
    baseCount: 1,
  },
  narrative: { source: 'deterministic', title: 'רייקיאוויק', summary: '' },
  commitments: [],
  days: [
    {
      ordinal: 1,
      date: '2026-08-29',
      timezone: 'Atlantic/Reykjavik',
      title: { kind: 'none' },
      summary: { kind: 'none' },
      sections: [],
    },
  ],
  appendix: { ops: [] },
};

const serve = (body: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }),
  );

describe('fetchSharedItinerary', () => {
  it('reads a projection this build understands', async () => {
    serve(projection);
    await expect(fetchSharedItinerary(CODE)).resolves.toMatchObject({ status: 'live' });
  });

  it('separates a projection it cannot read from a link that is gone', async () => {
    // A field a later deploy added. `sharedItinerarySchema` is strict in both directions
    // (see its header), so this is a PARSE failure and not an ignored key — which is the
    // ordinary state of a document that has not taken the newest build yet.
    serve({ ...projection, tomorrowsField: 'v' });
    await expect(fetchSharedItinerary(CODE)).rejects.toBeInstanceOf(SharedItineraryUnreadable);
  });

  it('reports the status, so 404 can be told from the rest', async () => {
    serve({}, 502);
    await expect(fetchSharedItinerary(CODE)).rejects.toMatchObject({ status: 502 });
  });
});

describe('shareLoadFailure', () => {
  it('calls only the server 404 gone', () => {
    expect(shareLoadFailure(new SharedItineraryUnavailable(404))).toBe(SHARE_LOAD_FAILURE.GONE);
  });

  it.each([500, 502, 503, 429])('treats %i as transient, because it is', (status) => {
    expect(shareLoadFailure(new SharedItineraryUnavailable(status))).toBe(
      SHARE_LOAD_FAILURE.TRANSIENT,
    );
  });

  it('treats an unreadable projection as its own thing: a stale document, not a dead link', () => {
    expect(shareLoadFailure(new SharedItineraryUnreadable(new Error('zod')))).toBe(
      SHARE_LOAD_FAILURE.UNREADABLE,
    );
  });

  it('defaults an error nobody recognises to transient, since asking again is the cheap cure', () => {
    expect(shareLoadFailure(new Error('offline'))).toBe(SHARE_LOAD_FAILURE.TRANSIENT);
    expect(shareLoadFailure(undefined)).toBe(SHARE_LOAD_FAILURE.TRANSIENT);
  });
});
