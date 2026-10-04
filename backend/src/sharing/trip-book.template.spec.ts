import { describe, expect, it } from 'vitest';
import {
  RECAP_ABSENT,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  type RecapFigure,
  type SharedItinerary,
  type TripEvent,
  type TripRecap,
} from '@waypoint/shared';
import { PDF_COPY } from './hebrew.copy';
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';
import { bookDayWhen, tripBookHtml } from './trip-book.template';
import type { TripRecord } from './trip-recap.service';

const COPY = PDF_COPY.book;
const QR = 'data:image/png;base64,iVBORw0KGgo=';
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';

const strip = (html: string): string => html.replace(/<[^>]*>/g, '').replace(/[⁦-⁩]/g, '');

const present = (value: number, extra: { unresolved?: number } = {}): RecapFigure => ({
  state: 'present',
  value,
  ...extra,
});

const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
const ev = (id: string, title: string, startsAt: string, extra: Partial<TripEvent> = {}) =>
  ({
    id,
    title,
    date: startsAt.slice(0, 10),
    startsAt,
    kind: 'soft',
    status: 'done',
    sortOrder: 0,
    source: 'manual',
    ...stamp,
    ...extra,
  }) as TripEvent;

const EVENTS: TripEvent[] = [
  ev('e1', 'סיור בעיר', '2026-08-30T09:00:00.000Z'),
  ev('e2', 'מפל גולפוס', '2026-08-31T13:00:00.000Z'),
  ev('e3', 'בר קוקטיילים', '2026-08-31T20:00:00.000Z', { status: 'skipped' }),
];

const RECAP: TripRecap = {
  figures: {
    days: present(9),
    nights: present(8),
    beds: RECAP_ABSENT,
    places: present(12, { unresolved: 2 }),
    placesByCategory: RECAP_ABSENT,
    kinds: RECAP_ABSENT,
    regions: RECAP_ABSENT,
    route: RECAP_ABSENT,
    groundMeters: present(1_240_000),
    footMeters: RECAP_ABSENT,
    airMeters: present(9_203_024),
    airMinutes: RECAP_ABSENT,
    zonesCrossed: RECAP_ABSENT,
    zoneShiftMinutes: present(-180),
  },
  superlatives: {
    busiestDay: { state: 'present', value: { date: '2026-08-31', places: 3 } },
    longestWalkDay: RECAP_ABSENT,
    longestFlight: RECAP_ABSENT,
    longestStop: { state: 'present', value: { eventId: 'e2', minutes: 150 } },
  },
  stragglers: [],
  nextTime: { skipped: ['e3'], ideas: ['m1'] },
  cover: { url: '/enrichment/images/cover.jpg', of: 'Gullfoss', credit: 'Wikimedia · CC BY-SA' },
  memoryPlace: 'Gullfoss',
};

const RECORD: TripRecord = {
  recap: RECAP,
  events: EVENTS,
  bookings: [],
  maybes: [
    {
      id: 'm1',
      title: 'לגונה כחולה',
      consumed: false,
      ...stamp,
    } as TripRecord['maybes'][number],
  ],
  evidence: {
    events: EVENTS,
    bookings: [],
    places: [],
    crossings: [],
    primaryZone: 'Atlantic/Reykjavik',
  },
};

/** The reference trip as the record projects it: day two skipped a row and has two notes. */
const bookProjection = (
  detailLevel: SharedItinerary['detailLevel'] = SHARE_DETAIL_LEVEL.FULL,
): SharedItinerary => ({
  ...NINE_DAY_REFERENCE_TRIP,
  detailLevel,
  days: NINE_DAY_REFERENCE_TRIP.days.map((day) =>
    day.ordinal === 2
      ? {
          ...day,
          skipped: ['בר קוקטיילים'],
          notes: [
            { kind: SHARE_OP_KIND.NOTE, body: 'לחזור לדוכן **השני** משמאל' },
            { kind: SHARE_OP_KIND.NOTE, title: 'ערב' },
          ],
        }
      : day,
  ),
});

const render = (projection: SharedItinerary, photos: Record<string, string> = {}) =>
  tripBookHtml({
    projection,
    record: RECORD,
    publicUrl: 'travelive.app/s/7Kq2mB9x',
    qrDataUrl: QR,
    photoDataUrls: photos,
  });

describe('tripBookHtml (ADR-0241 §6)', () => {
  it('opens on the cover: the kicker, the name, the figures and the QR', () => {
    const html = render(bookProjection());
    const text = strip(html);
    expect(text).toContain(COPY.kicker);
    expect(text).toContain(NINE_DAY_REFERENCE_TRIP.trip.name);
    // The Home's figures, in its order and words: places first, with what is still unmarked.
    expect(text).toMatch(
      new RegExp(`12${PDF_COPY.memory.fig.places}${PDF_COPY.memory.unresolved(2)}`),
    );
    expect(text).toContain(`9,203${PDF_COPY.memory.fig.air}`);
    expect(html).toContain(`<img src="${QR}"`);
    expect(html).toMatch(/\.bk-cover\{[^}]*break-after:page/);
  });

  it('prints the cover shot with its credit, and no box at all when the bytes are missing', () => {
    const withPhoto = render(bookProjection(), { [RECAP.cover!.url]: PHOTO });
    expect(withPhoto).toContain(`<img src="${PHOTO}"`);
    expect(strip(withPhoto)).toContain('Gullfoss · Wikimedia · CC BY-SA');

    expect(render(bookProjection())).not.toContain('Wikimedia · CC BY-SA');
  });

  it('gives each day what it skipped and the notes written on it', () => {
    const text = strip(render(bookProjection()));
    expect(text).toContain(COPY.skipped('בר קוקטיילים'));
    expect(text).toContain(COPY.notes);
    expect(text).toContain('לחזור לדוכן השני משמאל');
    expect(text).toContain(COPY.dayKicker(2, bookDayWhen('2026-08-30')));
  });

  it('never splits a day across a page', () => {
    expect(render(bookProjection())).toMatch(/\.bk-day\{[^}]*break-inside:avoid/);
  });

  it('closes on the figures, the firsts and bests, and next time, in the Home words', () => {
    const text = strip(render(bookProjection()));
    expect(text).toContain(COPY.figures);
    expect(text).toContain(`${COPY.bests.first} · סיור בעיר`);
    expect(text).toContain(`${COPY.bests.longestStop} · מפל גולפוס`);
    expect(text).toContain(COPY.bests.places(3));
    expect(text).toContain(`בר קוקטיילים · ${COPY.nextTime.skipped}`);
    expect(text).toContain(`לגונה כחולה · ${COPY.nextTime.idea}`);
  });

  // The policy decides what a page may say (ADR-0241 §6): at Summary no clock prints anywhere,
  // the back page's rows included.
  it('prints clocks at Full and none at Summary', () => {
    expect(strip(render(bookProjection()))).toContain('09:00');
    const summary = render(bookProjection(SHARE_DETAIL_LEVEL.SUMMARY));
    expect(summary).not.toMatch(/<span class="t">[^<]/);
    expect(strip(summary)).not.toContain('09:00');
  });

  it('escapes what the trip typed', () => {
    const projection = bookProjection();
    const html = render({
      ...projection,
      trip: { ...projection.trip, name: '<script>alert(1)</script>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  // Both found in the first real render, not by a spec.
  it('says the trip name once, and a stop named for its place once', () => {
    const projection = bookProjection();
    const text = strip(render(projection));
    expect(text.split(projection.trip.name)).toHaveLength(2);
    expect(text).not.toContain(projection.narrative.title);

    const stop = projection.days[1].sections[0].events[0];
    const named = render({
      ...projection,
      days: [
        {
          ...projection.days[1],
          sections: [
            {
              ...projection.days[1].sections[0],
              events: [{ ...stop, title: 'שוק צוקיג׳י', placeName: 'שוק צוקיג׳י' }],
            },
          ],
        },
      ],
    });
    expect(strip(named).split('שוק צוקיג׳י')).toHaveLength(2);
  });

  // JetBrains Mono ships no Hebrew, so a Hebrew letter inside a mono run prints as a box: the
  // weekday in `ה׳ 12.09` did, on the back page and every day title (owner, with a photo).
  it('puts no Hebrew inside a mono run, anywhere in the book', () => {
    for (const level of [SHARE_DETAIL_LEVEL.SUMMARY, SHARE_DETAIL_LEVEL.FULL]) {
      const html = render(bookProjection(level));
      const mono = [...html.matchAll(/<span class="pdf-(?:num|mono)">([^<]*)<\/span>/g)];
      expect(mono.length).toBeGreaterThan(0);
      for (const [, run] of mono) expect(run).not.toMatch(/[֐-׿]/);
    }
  });

  it('names a day the way the Home does', () => {
    expect(bookDayWhen('2026-09-25')).toBe('ו׳ 25.09');
  });
});
