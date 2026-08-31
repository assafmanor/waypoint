import {
  BOOKING_TYPE,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  SHARE_TRIP_SHAPE,
  type BookingType,
  type SharedDay,
  type SharedDayTitle,
  type SharedDaySummary,
  type SharedItinerary,
} from '@waypoint/shared';

/**
 * **The nine-day reference trip** — the same one the print mockup measured, and the trip
 * ADR-0213 §4's density targets are stated against (Summary one page, Full two).
 *
 * It lives in `src/` rather than a spec file because the container smoke entrypoint renders
 * it too: a fixture that only the unit test can see would leave the one check that runs a
 * real browser in a real image with nothing realistic to render.
 */
/**
 * **Every derived shape the renderers can be handed**, which is what makes this fixture the
 * check on the 2026-08-30 amendment rather than a pretty page: the outbound flight day, the
 * returning one, a route day, a day that stayed put, a night that belongs to the evening
 * before it, and a lodging that phrases the second line. A kind with no example here is a
 * kind nothing renders in CI.
 */
const DAYS: [
  string,
  SharedDayTitle,
  SharedDaySummary,
  [string, string, string, keyof typeof SHARE_DAYPART_KEY, BookingType?, string?][],
][] = [
  [
    '2026-08-29',
    { kind: SHARE_DAY_KIND.FLIGHT_OUT, to: 'איסלנד' },
    { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: 'Laugavegur 22' },
    [
      // Carries an END, so the range renders: a flight has to say when it lands.
      ['09:20', 'נחיתה בקפלוויק', 'KEF', 'MORNING', BOOKING_TYPE.FLIGHT, '14:05'],
      ['15:00', 'כניסה לדירה', 'Laugavegur 22', 'AFTERNOON', BOOKING_TYPE.HOTEL],
      ['19:30', 'ארוחת ערב בעיר', 'רייקיאוויק', 'EVENING', BOOKING_TYPE.RESTAURANT],
      // 01:40 sits in NIGHT and is rolled back onto this card by `sharePreviousNight`,
      // which is the layout the owner reported: without it, it prints at the bottom of
      // the 30th, below an evening nineteen hours later.
      ['01:40', 'אורות הצפון מהמרפסת', 'Laugavegur 22', 'NIGHT'],
    ],
  ],
  [
    '2026-08-30',
    { kind: SHARE_DAY_KIND.ROUTE, from: 'רייקיאוויק', to: 'מעגל הזהב' },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['הפארק הלאומי ת׳ינגווליר', 'גייזר וסטרוקור'] },
    [
      ['09:30', 'הפארק הלאומי ת׳ינגווליר', 'Þingvellir', 'MORNING'],
      ['13:15', 'גייזר וסטרוקור', 'Haukadalur', 'NOON'],
      ['16:00', 'מפל גולפוס', 'Gullfoss', 'AFTERNOON'],
      ['19:00', 'ארוחת ערב ליד המלון', 'Selfoss', 'EVENING'],
    ],
  ],
  [
    '2026-08-31',
    { kind: SHARE_DAY_KIND.ROUTE, from: 'ויק', to: 'הפיורדים המזרחיים' },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['החוף השחור רייניספיארה', 'נסיעה מזרחה'] },
    [
      ['08:30', 'החוף השחור רייניספיארה', 'Vík', 'MORNING'],
      ['15:00', 'נסיעה מזרחה', 'כביש 1', 'AFTERNOON'],
    ],
  ],
  [
    '2026-09-01',
    { kind: SHARE_DAY_KIND.PLACE, at: 'סיידיספיורדור' },
    { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: 'Norðurgata 2' },
    [
      ['09:00', 'שביל ב׳יולפור', 'Bjólfur', 'MORNING'],
      ['15:30', 'קפה בנורד אוסטור', 'Norðurgata 2', 'AFTERNOON'],
      ['', 'הליכה לאורך הפיורד', 'הטיילת', 'FLEXIBLE'],
    ],
  ],
  [
    '2026-09-02',
    { kind: SHARE_DAY_KIND.ROUTE, from: 'סיידיספיורדור', to: 'אגם מיוואטן' },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['מרחצאות מיוואטן', 'הר הגעש קרפלה'] },
    [
      ['10:00', 'מרחצאות מיוואטן', 'Jarðbaðshólar', 'MORNING'],
      ['14:30', 'הר הגעש קרפלה', 'Krafla', 'AFTERNOON'],
    ],
  ],
  [
    '2026-09-03',
    { kind: SHARE_DAY_KIND.ROUTE, from: 'אגם מיוואטן', to: 'אקוריירי' },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['הגן הבוטני', 'שיט לווייתנים'] },
    [
      ['09:30', 'הגן הבוטני', 'Eyrarlandsvegur', 'MORNING'],
      ['13:00', 'שיט לווייתנים', 'Eyjafjörður', 'NOON'],
    ],
  ],
  [
    '2026-09-04',
    { kind: SHARE_DAY_KIND.ROUTE, from: 'אקוריירי', to: 'סנייפלסנס' },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['קירקיופל', 'חוף דג׳ופלון'] },
    [
      ['10:00', 'קירקיופל', 'Grundarfjörður', 'MORNING'],
      ['16:30', 'חוף דג׳ופלון', 'Djúpalónssandur', 'AFTERNOON'],
    ],
  ],
  [
    '2026-09-05',
    { kind: SHARE_DAY_KIND.ROUTE, from: 'סנייפלסנס', to: 'הלגונה הכחולה' },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['הלגונה הכחולה', 'ארוחת פרידה'] },
    [
      ['11:00', 'הלגונה הכחולה', 'Norðurljósavegur 9', 'MORNING'],
      ['18:00', 'ארוחת פרידה', 'Grindavík', 'EVENING'],
    ],
  ],
  [
    '2026-09-06',
    { kind: SHARE_DAY_KIND.FLIGHT_HOME },
    { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['החזרת הרכב'] },
    [
      ['07:00', 'החזרת הרכב', 'KEF', 'MORNING', BOOKING_TYPE.CAR],
      ['09:40', 'טיסה הביתה', 'FI 562', 'MORNING', BOOKING_TYPE.FLIGHT],
    ],
  ],
];

const SHARE_DAYPART_KEY = SHARE_DAYPART;

/** Glyphs from the curated set (`packages/shared/src/icons.ts`), cycled per event. An icon
 *  is CONTENT, and Summary prints it — so a fixture with none would have left the emoji
 *  coverage check with nothing to find but the daypart marks. */
const FIXTURE_ICONS = ['✈️', '🏨', '🍽️', '⛰️', '🚗', '♨️', '🐳', '⛩️'] as const;

/** Where the reference trip sleeps. Real Icelandic towns, so the label is the shape the
 *  renderer actually meets — a Latin run inside a Hebrew line. */
const FIXTURE_STAYS = ['Reykjavík', 'Vík', 'Höfn', 'Egilsstaðir', 'Reykjahlíð', 'Akureyri'];

const days: SharedDay[] = DAYS.map(([date, title, summary, events], index) => {
  const byDaypart = new Map<
    string,
    { time: string; title: string; place: string; bookingType?: BookingType; endTime?: string }[]
  >();
  for (const [time, eventTitle, place, key, bookingType, endTime] of events) {
    const daypart = SHARE_DAYPART_KEY[key];
    const bucket = byDaypart.get(daypart) ?? [];
    bucket.push({ time, title: eventTitle, place, bookingType, endTime });
    byDaypart.set(daypart, bucket);
  }
  return {
    ordinal: index + 1,
    date,
    title,
    summary,
    // **The reference trip has to exercise what the renderer draws.** Without a stay on any
    // day the masthead's nights tile printed `0 לילות` in the smoke render, which looks
    // like a defect and hides one. Every day but the last has a night; the day you fly
    // home does not, which is also the shape that proves the tile counts rather than
    // assuming `dayCount - 1`.
    ...(index < DAYS.length - 1 ? { stay: FIXTURE_STAYS[index % FIXTURE_STAYS.length] } : {}),
    sections: [...byDaypart.entries()].map(([daypart, bucket]) => ({
      daypart: daypart as SharedDay['sections'][number]['daypart'],
      events: bucket.map((event, position) => ({
        title: event.title,
        icon: FIXTURE_ICONS[(index + position) % FIXTURE_ICONS.length],
        daypart: daypart as SharedDay['sections'][number]['daypart'],
        hard: event.title.includes('טיסה') || event.title.includes('נחיתה'),
        ...(event.time ? { startLabel: event.time } : {}),
        ...(event.bookingType ? { bookingType: event.bookingType } : {}),
        ...(event.endTime ? { endLabel: event.endTime } : {}),
        placeName: event.place,
      })),
    })),
  };
});

export const NINE_DAY_REFERENCE_TRIP: SharedItinerary = {
  status: 'live',
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  generatedAt: '2026-08-29T08:10:00.000Z',
  shareUrl: '/s/7Kq2mB9x',
  trip: {
    name: 'איסלנד עם המשפחה',
    destination: 'Iceland',
    icon: '🇮🇸',
    // A ring: it sleeps in Reykjavík at both ends, which is what makes it a loop rather
    // than a traverse — and what `FIXTURE_STAYS` above produces.
    shape: SHARE_TRIP_SHAPE.LOOP,
    baseCount: 6,
    startDate: '2026-08-29',
    endDate: '2026-09-06',
    dayCount: 9,
    eventCount: days.reduce(
      (total, day) => total + day.sections.reduce((n, s) => n + s.events.length, 0),
      0,
    ),
    routeLabels: ['רייקיאוויק', 'מעגל הזהב', 'ויק', 'הפיורדים', 'אקוריירי', 'סנייפלסנס'],
    // Deliberately larger than the strip above it: the masthead's `אזורים` fact reads THIS,
    // and reading `routeLabels.length` is what made a capped strip report the trip's size.
    routeStopCount: 9,
  },
  // Derived from the same schedule in production; written out here because a fixture has
  // no projection to derive from. Two flights, a car and the nights.
  commitments: [
    {
      bookingType: 'flight',
      title: 'תל אביב',
      detail: 'דרך וינה',
      date: '2026-08-29',
      dayOrdinal: 1,
    },
    {
      bookingType: 'car',
      title: 'Iceland Car Rental',
      detail: 'Keflavík',
      date: '2026-08-29',
      dayOrdinal: 1,
    },
    {
      bookingType: 'hotel',
      title: '8 לילות',
      detail: 'Reykjavík',
      date: '2026-08-29',
      endDate: '2026-09-05',
      dayOrdinal: 1,
    },
    {
      bookingType: 'flight',
      title: 'תל אביב',
      detail: 'דרך וינה',
      date: '2026-09-06',
      dayOrdinal: 9,
    },
  ],
  narrative: {
    source: 'deterministic',
    title: 'רייקיאוויק ← סנייפלסנס',
    summary: 'תשעה ימים סביב האי, מהמעגל הזהוב ועד הפיורדים המזרחיים וחזרה דרך סנייפלסנס.',
  },
  days,
};

/**
 * **A trip dense enough to fragment**, and the reason it exists is the defect it now guards.
 *
 * The reference trip above fits comfortably and proved nothing about pagination: the shipped
 * renderer sliced days into fixed groups, and it was a real twelve-day itinerary — whose
 * group overflowed the box drawn for it — that produced five sheets numbered to three, a
 * footer printed over the schedule and a blank page. Everything upstream of the paginator
 * was green for all of it. So the container smoke renders this too, and
 * `scripts/verify-pdf-smoke.mjs` checks each page's own footer against the sheet it is on.
 *
 * Derived from the reference trip rather than written out: what has to be dense is the day
 * COUNT and the rows per day, and repeating the same nine days with more sections in each
 * says that without another 120 lines of Hebrew fixture nobody will keep true.
 */
const denseDays: SharedDay[] = Array.from({ length: 12 }, (_, index) => {
  const source = days[index % days.length];
  return {
    ...source,
    ordinal: index + 1,
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    sections: source.sections.map((section) => ({
      ...section,
      // Three copies of each row, so a day card is taller than a column can hold whole.
      events: [...section.events, ...section.events, ...section.events],
    })),
  };
});

export const DENSE_REFERENCE_TRIP: SharedItinerary = {
  ...NINE_DAY_REFERENCE_TRIP,
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
  trip: {
    ...NINE_DAY_REFERENCE_TRIP.trip,
    startDate: '2026-09-01',
    endDate: '2026-09-12',
    dayCount: 12,
    eventCount: denseDays.reduce(
      (total, day) => total + day.sections.reduce((n, s) => n + s.events.length, 0),
      0,
    ),
    travelers: ['דנה', 'יואב', 'מיכל', 'רון', 'תמר'],
  },

  days: denseDays,
};
