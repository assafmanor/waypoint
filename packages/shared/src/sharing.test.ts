import { describe, expect, it } from 'vitest';
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  shareDaypart,
  sharePreviousNight,
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

// **The share's day starts at dawn** (ADR-0213's 2026-08-30 amendment; owner: _"The night
// part gets folded at the end of the wrong day"_). `shareDaypart` above already declares it —
// `night` is the fallthrough below hour 5 — and this is the other half of that statement, the
// one the grouping reads. Same boundary, same constant, deliberately no second number.
describe('sharePreviousNight', () => {
  it.each([
    ['2026-09-01T00:30:00Z', 'UTC', true],
    ['2026-09-01T04:59:00Z', 'UTC', true],
    ['2026-09-01T05:00:00Z', 'UTC', false],
    ['2026-09-01T22:00:00Z', 'UTC', false],
    [null, 'UTC', false],
  ])('reads %s in %s as the night before: %s', (startsAt, zone, expected) => {
    expect(sharePreviousNight(startsAt, zone)).toBe(expected);
  });

  // The zone is the event's own display zone (ADR-0107 §4), so the same instant rolls back on
  // one side of the world and not on the other — which is the whole reason it is not read off
  // the trip's primary zone.
  it('reads the displayed local hour, not UTC', () => {
    // 09:00Z is mid-morning in Reykjavík and 04:00 in Chicago — the second is the night
    // before. Honolulu is the near miss worth naming: 23:00 there is `night` by daypart and
    // is NOT rolled back, because it is the evening of its own day and not the tail of the
    // one before.
    const instant = '2026-09-01T09:00:00Z';
    expect(sharePreviousNight(instant, 'UTC')).toBe(false);
    expect(sharePreviousNight(instant, 'America/Chicago')).toBe(true);
    expect(sharePreviousNight(instant, 'Pacific/Honolulu')).toBe(false);
  });

  // The boundary this shares with `shareDaypart`: everything it calls the night before must
  // also be filed under `night`, or a rolled-back event would land in a section that renders
  // before the evening it belongs after.
  it('agrees with the daypart it is rolling back into', () => {
    for (const hour of ['00', '02', '04']) {
      const instant = `2026-09-01T${hour}:30:00Z`;
      expect(sharePreviousNight(instant, 'UTC')).toBe(true);
      expect(shareDaypart(instant, 'UTC')).toBe(SHARE_DAYPART.NIGHT);
    }
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
      routeStopCount: 2,
    },
    narrative: { source: 'deterministic', title: 'רייקיאוויק ← ויק', summary: '9 ימים' },
    days: [
      {
        ordinal: 1,
        date: '2026-08-29',
        title: { kind: SHARE_DAY_KIND.FLIGHT_OUT, to: 'איסלנד' },
        summary: { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: 'Laugavegur 22' },
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

  // **A day headline is a kind plus its values, never a sentence** (ADR-0213's 2026-08-30
  // amendment) — so the union is what the contract owes, and a stray shape must not parse.
  it('rejects a day headline that carries the wrong values for its kind', () => {
    const days = structuredClone(projection.days);
    // `flightHome` names no place: home is the absence of the trip.
    (days[0] as Record<string, unknown>).title = { kind: SHARE_DAY_KIND.FLIGHT_HOME, to: 'נתב״ג' };
    expect(() => sharedItinerarySchema.parse({ ...projection, days })).toThrow();
  });

  it('rejects the composed string a day headline used to be', () => {
    const days = structuredClone(projection.days);
    (days[0] as Record<string, unknown>).title = 'קפלוויק ← רייקיאוויק';
    expect(() => sharedItinerarySchema.parse({ ...projection, days })).toThrow();
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
