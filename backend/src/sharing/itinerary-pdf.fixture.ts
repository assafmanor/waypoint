import {
  BOOKING_TYPE,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  SHARE_TRIP_SHAPE,
  TIME_MEANING,
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
    // **The zone the day is lived in** (`SharedDay.timezone`) — Iceland every day but the
    // last, which is the day the trip flies home and lands on its own clock. Paper prints no
    // `עכשיו` and so reads none of this; it is here because the field is required and a
    // fixture that spelled one zone for all twelve days would be modelling the defect
    // `SharedDay.timezone` exists to fix.
    timezone: index === DAYS.length - 1 ? 'Asia/Jerusalem' : 'Atlantic/Reykjavik',
    title,
    summary,
    // **The reference trip has to exercise what the renderer draws.** Without a stay on any
    // day the masthead's nights tile printed `0 לילות` in the smoke render, which looks
    // like a defect and hides one. Every day but the last has a night; the day you fly
    // home does not, which is also the shape that proves the tile counts rather than
    // assuming `dayCount - 1`.
    ...(index < DAYS.length - 1 ? { stay: FIXTURE_STAYS[index % FIXTURE_STAYS.length] } : {}),
    // **The stay's two moments, so the renderer's own header is exercised** (ADR-0213's
    // 2026-09-01 amendment §4). They were absent, which is why the tofu guard never saw
    // `צ׳ק-אאוט עד` — a Hebrew word beside a mono clock, the exact shape the thirteenth
    // amendment found printing as boxes. A check-in wherever there is a night; a check-out on
    // every day but the first, since nothing is being left on the day you arrive.
    ...(index < DAYS.length - 1
      ? { checkIn: { label: '15:00', endLabel: '21:00', meaning: TIME_MEANING.WINDOW } }
      : {}),
    ...(index > 0 ? { checkOut: { label: '11:00', meaning: TIME_MEANING.NOT_AFTER } } : {}),
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
        // **What the row's clock MEANS** (ADR-0213's 2026-08-31 amendment §1) — the field
        // the renderer actually prints from. The fixture's events are ordinary points and
        // spans, so they are all `exact`; the flexible arms are exercised by
        // `itinerary-pdf.template.spec.ts`, which builds them directly.
        ...(event.time
          ? {
              time: {
                label: event.time,
                ...(event.endTime ? { endLabel: event.endTime } : {}),
                meaning: TIME_MEANING.EXACT,
              },
            }
          : {}),
        placeName: event.place,
      })),
    })),
  };
});

/**
 * **THE RETURN IS A CHAINED JOURNEY, because nothing in CI had one** (2026-09-01).
 *
 * `legRows` — the whole `.pdf-trek` block, its head, its layover lines and its per-leg times
 * — was rendered by no fixture in the repo, so no spec and no container smoke ever drew one.
 * That is how the head printed leg one's clock where the journey runs four hours longer, and
 * it is also why `itinerary-pdf.template.spec.ts`'s "no facts line inside a journey block"
 * had been green while iterating over **zero** journey blocks (the same vacuous-guard shape
 * ADR-0213's thirteenth amendment §2 found on the mono guard).
 *
 * Applied as a post-pass rather than through `DAYS`, whose tuple grammar is one row = one
 * event: a journey is several events collapsed into one row, which is precisely the shape
 * that grammar cannot express. The numbers are the owner's real return — KEF → FRA → TLV,
 * a 4:20 wait in Frankfurt and a +3 clock change — so what CI draws is what was reported.
 */
const withChainedReturn = (source: SharedDay[]): SharedDay[] =>
  source.map((day, index) =>
    index < source.length - 1
      ? day
      : {
          ...day,
          sections: day.sections.map((section) => ({
            ...section,
            events: section.events.map((event) =>
              event.title === 'טיסה הביתה'
                ? {
                    ...event,
                    title: 'קפלאוויק ← נתב״ג',
                    journeyTo: 'נתב״ג',
                    startLabel: '02:20',
                    endLabel: '15:25',
                    // The JOURNEY's clock, not leg one's — the projection overrides this for
                    // a chain and the fixture has to state the same thing, or the spec that
                    // reads it proves nothing.
                    time: { label: '02:20', endLabel: '15:25', meaning: TIME_MEANING.EXACT },
                    durationMinutes: 725,
                    zoneShiftMinutes: 180,
                    // **The container's own attachments**, so the fold inside a chained
                    // journey is drawn by something (2026-09-01). Paper dropped both for a
                    // chain and nothing noticed, because nothing had a chain.
                    caption: 'שדה התעופה קפלאוויק משרת את רייקיאוויק ואת כל דרום־מערב האי.',
                    ops: [
                      { kind: SHARE_OP_KIND.CODE, code: 'KEF-4821', provider: 'Icelandair' },
                      { kind: SHARE_OP_KIND.NOTE, title: 'צ׳ק-אין מקוון נפתח 24 שעות לפני' },
                    ],
                    legs: [
                      {
                        title: 'קפלאוויק ← פרנקפורט',
                        code: 'FI 562',
                        startLabel: '02:20',
                        endLabel: '05:50',
                        durationMinutes: 210,
                      },
                      {
                        title: 'פרנקפורט ← נתב״ג',
                        code: 'LY 356',
                        startLabel: '11:10',
                        endLabel: '15:25',
                        durationMinutes: 255,
                        layoverMinutes: 260,
                        layoverPlace: 'פרנקפורט',
                      },
                    ],
                  }
                : event,
            ),
          })),
        },
  );

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
    // Carried because the projection is strict, and ignored by the renderer this fixture
    // feeds: paper prints dates, never `עכשיו` (eleventh amendment §6).
    timezone: 'Atlantic/Reykjavik',
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
  days: withChainedReturn(days),
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
