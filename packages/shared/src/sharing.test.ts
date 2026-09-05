import { describe, expect, it } from 'vitest';
import {
  shareToday,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_OP_KIND,
  SHARE_TRIP_SHAPE,
  tripShapeOf,
  sharedLegSchema,
  SHARE_DETAIL_LEVEL,
  shareDaypart,
  sharePreviousNight,
  sharedItinerarySchema,
  summaryNarrativeInputSchema,
  itineraryNarrativeOutputSchema,
  tripShareConfigSchema,
  upsertTripShareSchema,
  NO_SENSITIVE_FIELDS,
  dayPhoto,
  placeCredit,
  NARRATIVE_SEPARATOR,
  PHOTO_CONFIDENCE_FLOOR,
  type DayPhotoEvent,
  type DayPhotoPlace,
} from './sharing';
import type { DeliveredImageValue } from './enrichment';

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
describe('shareToday (ADR-0213 eleventh amendment §6)', () => {
  it('is the calendar day once the share\u2019s day has begun', () => {
    expect(shareToday(new Date('2026-09-01T05:00:00Z'), 'UTC')).toBe('2026-09-01');
    expect(shareToday(new Date('2026-09-01T14:05:00Z'), 'UTC')).toBe('2026-09-01');
    expect(shareToday(new Date('2026-09-01T23:59:00Z'), 'UTC')).toBe('2026-09-01');
  });

  it('is still YESTERDAY before dawn, agreeing with the grouping', () => {
    // The defect this exists for, found by opening the real page at 01:48 Tokyo time: the
    // calendar had rolled over while the share's day had not, so the page marked tomorrow as
    // "now" and — because a pre-dawn hour sorts last — drew its now-line at the bottom of a
    // day nothing had happened in yet. `sharePreviousNight` files a 01:00 landing on the
    // night before; this is the same boundary answering "what day is it".
    expect(shareToday(new Date('2026-09-01T00:30:00Z'), 'UTC')).toBe('2026-08-31');
    expect(shareToday(new Date('2026-09-01T04:59:00Z'), 'UTC')).toBe('2026-08-31');
  });

  it('reads the zone it is given, not UTC', () => {
    // 16:48Z is 01:48 the next day in Tokyo — before dawn there, so the share's day is still
    // the 31st, while in Reykjavík it is simply the afternoon of the 31st.
    const instant = new Date('2026-08-31T16:48:00Z');
    expect(shareToday(instant, 'Asia/Tokyo')).toBe('2026-08-31');
    expect(shareToday(instant, 'Atlantic/Reykjavik')).toBe('2026-08-31');
    // And once Tokyo is past dawn the two disagree, which is the point of taking the zone.
    const morning = new Date('2026-08-31T22:00:00Z');
    expect(shareToday(morning, 'Asia/Tokyo')).toBe('2026-09-01');
    expect(shareToday(morning, 'Atlantic/Reykjavik')).toBe('2026-08-31');
  });

  it('rolls a month back correctly', () => {
    expect(shareToday(new Date('2026-09-01T02:00:00Z'), 'UTC')).toBe('2026-08-31');
    expect(shareToday(new Date('2027-01-01T02:00:00Z'), 'UTC')).toBe('2026-12-31');
  });
});

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
            events: [{ title: 'נחיתה', daypart: SHARE_DAYPART.MORNING, icon: '✈️' }],
          },
        ],
      }).days[0].ordinal,
    ).toBe(1);
  });

  /**
   * **`placeName` is refused, which is what makes the docblock's claim true** (ADR-0213's
   * tenth amendment §6). It travelled until now, and it was the one copied field the
   * projection sets only after its Summary early return — so the input was NOT independent
   * of the selected level and one trip generated a different narrative per level. Strictness
   * is what turns that from a promise into a parse failure.
   */
  it('refuses a per-event place name, so the input cannot depend on the level', () => {
    expect(() =>
      summaryNarrativeInputSchema.parse({
        locale: 'he',
        routeLabels: [],
        days: [
          {
            ordinal: 1,
            events: [{ title: 'נחיתה', daypart: SHARE_DAYPART.MORNING, placeName: 'KEF' }],
          },
        ],
      }),
    ).toThrow();
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
      timezone: 'Atlantic/Reykjavik',
      dayCount: 9,
      eventCount: 21,
      routeLabels: ['רייקיאוויק', 'ויק'],
      routeStopCount: 2,
      shape: SHARE_TRIP_SHAPE.LINE,
      baseCount: 2,
    },
    narrative: { source: 'deterministic', title: 'רייקיאוויק ← ויק', summary: '9 ימים' },
    // Empty is the honest value for a trip with nothing booked — the block is then absent
    // from a renderer rather than present and blank.
    commitments: [],
    days: [
      {
        ordinal: 1,
        date: '2026-08-29',
        timezone: 'Atlantic/Reykjavik',
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

  describe('what the 2026-08-30 amendment added', () => {
    const withDay = (day: Record<string, unknown>) =>
      sharedItinerarySchema.parse({
        ...projection,
        days: [{ ...projection.days[0], ...day }],
      });

    it('takes a stay on the day and a photo that must carry its credit', () => {
      expect(withDay({ stay: 'Reykjahlíð' }).days[0].stay).toBe('Reykjahlíð');
      // Required, never optional: 27 of the 32 Commons files ADR-0166 §12.2 surveyed
      // demand attribution, so a credit a renderer could forget is a licence breach.
      expect(() => withDay({ photo: { url: '/enrichment/images/abc', of: 'גודאפוס' } })).toThrow();
      // **Root-relative, never absolute.** The server has no reliable view of its own
      // public origin and never writes one — `deliveredImageValueSchema` says so, and a
      // `.url()` here rejected every real value until a test fed it one.
      expect(() =>
        withDay({
          photo: { url: 'https://example.org/a.jpg', of: 'גודאפוס', credit: 'CC0' },
        }),
      ).toThrow();
      expect(
        withDay({ photo: { url: '/enrichment/images/abc', of: 'גודאפוס', credit: 'CC0' } }).days[0]
          .photo?.url,
      ).toBe('/enrichment/images/abc');
    });

    it('refuses a journey with fewer than two legs', () => {
      const leg = { title: 'תל אביב', startLabel: '14:30' };
      const withLegs = (legs: unknown[]) =>
        withDay({
          sections: [
            {
              daypart: SHARE_DAYPART.AFTERNOON,
              events: [{ ...projection.days[0].sections[0].events[0], legs }],
            },
          ],
        });
      // One leg is not a journey — it is an event, and drawing a journey frame around it
      // would say there is a connection to see.
      expect(() => withLegs([leg])).toThrow();
      expect(
        withLegs([leg, { ...leg, layoverMinutes: 45 }]).days[0].sections[0].events[0].legs,
      ).toHaveLength(2);
    });

    it('keeps every op kind closed, and a layover positive', () => {
      const ops = (value: unknown) =>
        withDay({
          sections: [
            {
              daypart: SHARE_DAYPART.AFTERNOON,
              events: [{ ...projection.days[0].sections[0].events[0], ops: [value] }],
            },
          ],
        });
      expect(ops({ kind: SHARE_OP_KIND.CODE, code: '8JHEI4' })).toBeTruthy();
      expect(() => ops({ kind: 'secret', code: '8JHEI4' })).toThrow();
      // A code with no value is not a code; the discriminant does not excuse the payload.
      expect(() => ops({ kind: SHARE_OP_KIND.CODE })).toThrow();
    });

    it('will not take a zero-minute layover', () => {
      // A wait we measured as nothing is a wait we could not measure — printing `0 דקות`
      // between two legs claims a fact the clock never gave us.
      expect(() => sharedLegSchema.parse({ title: 'וינה', layoverMinutes: 0 })).toThrow();
      expect(sharedLegSchema.parse({ title: 'וינה', layoverMinutes: 45 }).layoverMinutes).toBe(45);
    });
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
  /** The shapes ADR-0213's 2026-08-30 amendment added, each asserted at its edge — a
   *  `strictObject` is only a contract if something proves it refuses. */
});
describe('tripShapeOf', () => {
  /** Owner, 2026-08-30: a circumnavigation where the base changes every day or two is a
   *  different thing from a trip you take from one place, and the titles should say so. */
  it('calls one base a star trip', () => {
    expect(tripShapeOf(['Tokyo', 'Tokyo', 'Tokyo'])).toEqual({
      shape: SHARE_TRIP_SHAPE.BASE,
      baseCount: 1,
    });
  });

  it('calls a ring a loop, and counts the bases DISTINCTLY', () => {
    // Reykjavík at both ends is one base slept at twice, not two — counting runs would
    // tell the reader the trip stayed somewhere it did not.
    expect(tripShapeOf(['Reykjavík', 'Vík', 'Höfn', 'Reykjavík'])).toEqual({
      shape: SHARE_TRIP_SHAPE.LOOP,
      baseCount: 3,
    });
  });

  it('calls a traverse a line', () => {
    expect(tripShapeOf(['Lisboa', 'Porto', 'Braga'])).toEqual({
      shape: SHARE_TRIP_SHAPE.LINE,
      baseCount: 3,
    });
  });

  it('collapses consecutive nights in one place into one base', () => {
    // Three nights in Vík is one base, so a trip that sleeps Reykjavík-Vík-Vík-Vík is a
    // two-base traverse rather than a four-base sprint.
    expect(tripShapeOf(['Reykjavík', 'Vík', 'Vík', 'Vík'])).toEqual({
      shape: SHARE_TRIP_SHAPE.LINE,
      baseCount: 2,
    });
  });

  it('says unknown rather than guessing when no nights are recorded', () => {
    // A day trip, or a trip whose lodging was never entered. Both are real states, and
    // neither is a star trip — which is what a `length === 0 -> BASE` default would claim.
    expect(tripShapeOf([])).toEqual({ shape: SHARE_TRIP_SHAPE.UNKNOWN, baseCount: 0 });
    expect(tripShapeOf([undefined, undefined])).toEqual({
      shape: SHARE_TRIP_SHAPE.UNKNOWN,
      baseCount: 0,
    });
    // A single recorded night among unrecorded ones is still one base — absent is absent,
    // not a different place.
    expect(tripShapeOf([undefined, 'Vík', undefined]).shape).toBe(SHARE_TRIP_SHAPE.BASE);
  });
});

/**
 * **The photo gate and the rank** (ADR-0213's 2026-08-30 amendment), tested here rather than
 * through the projection since ADR-0219 §7 — both the reader and the app's day head picture a
 * day through this function, and a gate proved only against a Prisma fixture is a gate the app
 * has no evidence for. One integration assertion stays in the projection spec, for the wiring.
 */
describe('dayPhoto', () => {
  const image = (over: Partial<DeliveredImageValue> = {}): DeliveredImageValue => ({
    url: '/enrichment/images/abc',
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    sizeBytes: 90_000,
    source: 'commons',
    license: 'CC BY-SA 4.0',
    attribution: 'A. Photographer',
    fetchedAt: '2026-08-01T00:00:00.000Z',
    method: 'name_proximity',
    ref: 'Q38519',
    confidence: 1,
    ...over,
  });
  const place = (id: string, over: Partial<DayPhotoPlace> = {}): DayPhotoPlace => ({ id, ...over });
  const places = (...rows: DayPhotoPlace[]): ReadonlyMap<string, DayPhotoPlace> =>
    new Map(rows.map((row) => [row.id, row]));
  const at = (placeId: string, over: Partial<DayPhotoEvent> = {}): DayPhotoEvent => ({
    placeId,
    title: placeId,
    ...over,
  });
  const label = (row: DayPhotoPlace) => row.nickname ?? `שם ${row.id}`;

  it('publishes nothing below the confidence floor, and something at it', () => {
    // 0.8 is `geosearch`: found by coordinates, corroborated by nothing readable. Enough for
    // a summary, not enough for a picture — a wrong photo is visibly wrong in a way a wrong
    // opening-hours line is not.
    const under = { p1: { image: image({ confidence: 0.8 }) } };
    expect(dayPhoto([at('p1')], places(place('p1')), under, label)).toBeUndefined();

    const floor = { p1: { image: image({ confidence: PHOTO_CONFIDENCE_FLOOR }) } };
    expect(dayPhoto([at('p1')], places(place('p1')), floor, label)?.url).toBe(
      '/enrichment/images/abc',
    );
  });

  it('publishes nothing it cannot credit, however confident the match', () => {
    // 27 of the 32 Commons files ADR-0166 §12.2 surveyed require attribution. A file we
    // cannot credit is one we may not publish — the licence is not ours to drop.
    const uncreditable = { p1: { image: image({ attribution: undefined, license: '' }) } };
    expect(dayPhoto([at('p1')], places(place('p1')), uncreditable, label)).toBeUndefined();
  });

  it('carries the credit and the subject with the picture, never the picture alone', () => {
    const photo = dayPhoto(
      [at('p1')],
      places(place('p1', { nickname: 'הבירה' })),
      { p1: { image: image() } },
      label,
    );
    expect(photo?.of).toBe('הבירה');
    expect(photo?.credit).toBe(placeCredit(image()));
  });

  // **Dwell is the strongest term and it is the traveller's own** — four hours at
  // Landmannalaugar beats fifteen minutes at Öxarárfoss, whatever the world thinks of either.
  it('ranks the stop the day was actually spent at', () => {
    const enrichments = { p1: { image: image() }, p2: { image: image({ url: '/img/long' }) } };
    const photo = dayPhoto(
      [
        at('p1', { startsAt: '2026-08-01T09:00:00.000Z', endsAt: '2026-08-01T09:15:00.000Z' }),
        at('p2', { startsAt: '2026-08-01T10:00:00.000Z', endsAt: '2026-08-01T14:00:00.000Z' }),
      ],
      places(place('p1'), place('p2')),
      enrichments,
      label,
    );
    expect(photo?.url).toBe('/img/long');
  });

  // The rank reads ISO strings. A `Date` in `startsAt` would stringify to something
  // `Date.parse` cannot read, so every stop would score zero dwell and the day would be
  // pictured by its ratings alone — silently (`packages/shared/CLAUDE.md`).
  it('scores no dwell for an untimed stop, and lets the other terms decide', () => {
    const enrichments = { p1: { image: image() }, p2: { image: image({ url: '/img/known' }) } };
    const photo = dayPhoto(
      [at('p1'), at('p2')],
      places(place('p1'), place('p2', { userRatingsTotal: 40_000 })),
      enrichments,
      label,
    );
    expect(photo?.url).toBe('/img/known');
  });

  it('has no picture for a day whose stops are not in reach, or carry no image', () => {
    expect(dayPhoto([at('gone')], places(place('p1')), { p1: { image: image() } }, label)).toBe(
      undefined,
    );
    expect(dayPhoto([at('p1')], places(place('p1')), {}, label)).toBeUndefined();
  });
});

/**
 * **One credit line, composed once** (ADR-0219 §6). It had two implementations that disagreed
 * about ORDER — the app isolated each run so the photographer led at the start edge; the
 * projection joined the raw strings, so the reader printed the same credit the other way round.
 */
describe('placeCredit', () => {
  it('leads with the photographer and isolates each run', () => {
    const credit = placeCredit({ attribution: 'A. Photographer', license: 'CC BY-SA 4.0' });
    // The photographer first, in source order — which is what puts it at the start edge of an
    // RTL line once each run carries its own isolate.
    expect(credit.indexOf('A. Photographer')).toBeLessThan(credit.indexOf('CC BY-SA 4.0'));
    expect(credit).toContain(NARRATIVE_SEPARATOR);
    // First-strong for the name (it may be Hebrew or Latin), forced LTR for the licence code.
    expect(credit.startsWith('⁨')).toBe(true);
    expect(credit).toContain('⁦CC BY-SA 4.0⁩');
  });

  it('is the licence alone when nobody is owed a credit', () => {
    // 5 of the 32 files surveyed owe no attribution at all, and the licence is then the line.
    expect(placeCredit({ attribution: undefined, license: 'CC0' })).toBe('⁦CC0⁩');
  });
});
