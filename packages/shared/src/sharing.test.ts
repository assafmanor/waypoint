import { describe, expect, it } from 'vitest';
import {
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  shareDaypart,
  sharedItinerarySchema,
  summaryNarrativeInputSchema,
  itineraryNarrativeOutputSchema,
  tripShareConfigSchema,
  upsertTripShareSchema,
  NO_SENSITIVE_FIELDS,
} from './sharing';

describe('shareDaypart', () => {
  it.each([
    ['2026-09-01T04:59:00Z', 'UTC', SHARE_DAYPART.NIGHT],
    ['2026-09-01T05:00:00Z', 'UTC', SHARE_DAYPART.MORNING],
    ['2026-09-01T11:59:00Z', 'UTC', SHARE_DAYPART.MORNING],
    ['2026-09-01T12:00:00Z', 'UTC', SHARE_DAYPART.NOON],
    ['2026-09-01T13:59:00Z', 'UTC', SHARE_DAYPART.NOON],
    ['2026-09-01T14:00:00Z', 'UTC', SHARE_DAYPART.AFTERNOON],
    ['2026-09-01T17:59:00Z', 'UTC', SHARE_DAYPART.AFTERNOON],
    ['2026-09-01T18:00:00Z', 'UTC', SHARE_DAYPART.EVENING],
    ['2026-09-01T21:59:00Z', 'UTC', SHARE_DAYPART.EVENING],
    ['2026-09-01T22:00:00Z', 'UTC', SHARE_DAYPART.NIGHT],
    ['2026-09-01T00:00:00Z', 'UTC', SHARE_DAYPART.NIGHT],
    [null, 'Asia/Tokyo', SHARE_DAYPART.FLEXIBLE],
  ])('groups %s in %s', (startsAt, zone, expected) => {
    expect(shareDaypart(startsAt, zone)).toBe(expected);
  });

  // The zone is the whole point: the same instant is a Tokyo evening and a Reykjavík
  // morning, and the shared page must say what the app says (ADR-0107 §4).
  it('reads the displayed local hour, not UTC', () => {
    const instant = '2026-09-01T09:00:00Z';
    expect(shareDaypart(instant, 'UTC')).toBe(SHARE_DAYPART.MORNING);
    expect(shareDaypart(instant, 'Asia/Tokyo')).toBe(SHARE_DAYPART.EVENING);
    expect(shareDaypart(instant, 'Pacific/Honolulu')).toBe(SHARE_DAYPART.NIGHT);
  });
});

describe('upsertTripShareSchema', () => {
  const full = {
    detailLevel: SHARE_DETAIL_LEVEL.FULL,
    sensitive: NO_SENSITIVE_FIELDS,
    documentIds: [],
  };

  it('accepts a Full share with every sensitive family off', () => {
    expect(upsertTripShareSchema.parse(full)).toEqual(full);
  });

  it('keeps Everything fields off unless the level is Everything', () => {
    expect(() =>
      upsertTripShareSchema.parse({
        ...full,
        sensitive: { ...NO_SENSITIVE_FIELDS, bookingSecrets: true },
      }),
    ).toThrow();
  });

  it('keeps selected documents out of Summary and Full', () => {
    expect(() => upsertTripShareSchema.parse({ ...full, documentIds: ['doc-aaaaaaaa'] })).toThrow();
  });

  it('allows an enabled family only at Everything', () => {
    const parsed = upsertTripShareSchema.parse({
      detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
      sensitive: { ...NO_SENSITIVE_FIELDS, bookingSecrets: true },
      documentIds: ['doc-aaaaaaaa'],
    });
    expect(parsed.sensitive.bookingSecrets).toBe(true);
  });

  it('rejects an unknown field rather than silently dropping it', () => {
    expect(() => upsertTripShareSchema.parse({ ...full, includeCosts: true })).toThrow();
  });
});

describe('narrative contracts', () => {
  it('rejects unknown narrative input fields', () => {
    expect(() =>
      summaryNarrativeInputSchema.parse({
        locale: 'he',
        routeLabels: [],
        days: [],
        travelerNames: ['Dana'],
      }),
    ).toThrow();
  });

  it('accepts the allowlisted narrative input', () => {
    expect(
      summaryNarrativeInputSchema.parse({
        locale: 'he',
        routeLabels: ['רייקיאוויק', 'ויק'],
        days: [
          {
            ordinal: 1,
            events: [{ title: 'נחיתה', daypart: SHARE_DAYPART.MORNING, placeName: 'KEF' }],
          },
        ],
      }).days[0].ordinal,
    ).toBe(1);
  });

  it('refuses narrative output carrying a URL', () => {
    expect(() =>
      itineraryNarrativeOutputSchema.parse({
        title: 'כביש 1',
        summary: 'ראו https://example.com',
        days: [],
      }),
    ).toThrow();
  });
});

describe('sharedItinerarySchema', () => {
  const projection = {
    status: 'live',
    detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
    generatedAt: '2026-08-29T08:10:00.000Z',
    shareUrl: '/s/7Kq2mB9x',
    trip: {
      name: 'איסלנד עם המשפחה',
      destination: 'Iceland',
      icon: '🇮🇸',
      startDate: '2026-08-29',
      endDate: '2026-09-06',
      dayCount: 9,
      eventCount: 21,
      routeLabels: ['רייקיאוויק', 'ויק'],
    },
    narrative: { source: 'deterministic', title: 'רייקיאוויק ← ויק', summary: '9 ימים' },
    days: [
      {
        ordinal: 1,
        date: '2026-08-29',
        title: 'קפלוויק ← רייקיאוויק',
        summary: 'נחיתה',
        sections: [
          {
            daypart: SHARE_DAYPART.MORNING,
            events: [{ title: 'נחיתה בקפלוויק', icon: '✈️', daypart: SHARE_DAYPART.MORNING }],
          },
        ],
      },
    ],
  };

  it('accepts a Summary projection with no exact facts', () => {
    expect(
      sharedItinerarySchema.parse(projection).days[0].sections[0].events[0].startLabel,
    ).toBeUndefined();
  });

  it('rejects an unknown key anywhere in the tree', () => {
    expect(() =>
      sharedItinerarySchema.parse({
        ...projection,
        trip: { ...projection.trip, tripId: 'trip-japan-26' },
      }),
    ).toThrow();
  });

  it('rejects an event carrying coordinates', () => {
    const days = structuredClone(projection.days);
    (days[0].sections[0].events[0] as Record<string, unknown>).lat = 64.13;
    expect(() => sharedItinerarySchema.parse({ ...projection, days })).toThrow();
  });
});

describe('tripShareConfigSchema', () => {
  it('carries a root-relative share url, never an origin', () => {
    const config = tripShareConfigSchema.parse({
      code: '7Kq2mB9x',
      shareUrl: '/s/7Kq2mB9x',
      detailLevel: SHARE_DETAIL_LEVEL.FULL,
      sensitive: NO_SENSITIVE_FIELDS,
      documentIds: [],
      updatedAt: '2026-08-29T08:10:00.000Z',
    });
    expect(config.shareUrl.startsWith('/s/')).toBe(true);
  });

  it('rejects an absolute share url', () => {
    expect(() =>
      tripShareConfigSchema.parse({
        code: '7Kq2mB9x',
        shareUrl: 'https://travelive.app/s/7Kq2mB9x',
        detailLevel: SHARE_DETAIL_LEVEL.FULL,
        sensitive: NO_SENSITIVE_FIELDS,
        documentIds: [],
        updatedAt: '2026-08-29T08:10:00.000Z',
      }),
    ).toThrow();
  });
});
