import {
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  type SharedDay,
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
const DAYS: [string, string, string, [string, string, string, keyof typeof SHARE_DAYPART_KEY][]][] =
  [
    [
      '2026-08-29',
      'קפלוויק ← רייקיאוויק',
      'נחיתה בקפלוויק · כניסה לדירה',
      [
        ['09:20', 'נחיתה בקפלוויק', 'KEF', 'MORNING'],
        ['15:00', 'כניסה לדירה', 'Laugavegur 22', 'AFTERNOON'],
        ['19:30', 'ארוחת ערב בעיר', 'רייקיאוויק', 'EVENING'],
      ],
    ],
    [
      '2026-08-30',
      'רייקיאוויק ← מעגל הזהב',
      'הפארק הלאומי ת׳ינגווליר · גייזר וסטרוקור',
      [
        ['09:30', 'הפארק הלאומי ת׳ינגווליר', 'Þingvellir', 'MORNING'],
        ['13:15', 'גייזר וסטרוקור', 'Haukadalur', 'NOON'],
        ['16:00', 'מפל גולפוס', 'Gullfoss', 'AFTERNOON'],
        ['19:00', 'ארוחת ערב ליד המלון', 'Selfoss', 'EVENING'],
      ],
    ],
    [
      '2026-08-31',
      'ויק ← הפיורדים המזרחיים',
      'החוף השחור רייניספיארה · נסיעה מזרחה',
      [
        ['08:30', 'החוף השחור רייניספיארה', 'Vík', 'MORNING'],
        ['15:00', 'נסיעה מזרחה', 'כביש 1', 'AFTERNOON'],
      ],
    ],
    [
      '2026-09-01',
      'סיידיספיורדור',
      'שביל ב׳יולפור · קפה בנורד אוסטור',
      [
        ['09:00', 'שביל ב׳יולפור', 'Bjólfur', 'MORNING'],
        ['15:30', 'קפה בנורד אוסטור', 'Norðurgata 2', 'AFTERNOON'],
        ['', 'הליכה לאורך הפיורד', 'הטיילת', 'FLEXIBLE'],
      ],
    ],
    [
      '2026-09-02',
      'סיידיספיורדור ← אגם מיוואטן',
      'מרחצאות מיוואטן · הר הגעש קרפלה',
      [
        ['10:00', 'מרחצאות מיוואטן', 'Jarðbaðshólar', 'MORNING'],
        ['14:30', 'הר הגעש קרפלה', 'Krafla', 'AFTERNOON'],
      ],
    ],
    [
      '2026-09-03',
      'אגם מיוואטן ← אקוריירי',
      'הגן הבוטני · שיט לווייתנים',
      [
        ['09:30', 'הגן הבוטני', 'Eyrarlandsvegur', 'MORNING'],
        ['13:00', 'שיט לווייתנים', 'Eyjafjörður', 'NOON'],
      ],
    ],
    [
      '2026-09-04',
      'אקוריירי ← סנייפלסנס',
      'קירקיופל · חוף דג׳ופלון',
      [
        ['10:00', 'קירקיופל', 'Grundarfjörður', 'MORNING'],
        ['16:30', 'חוף דג׳ופלון', 'Djúpalónssandur', 'AFTERNOON'],
      ],
    ],
    [
      '2026-09-05',
      'סנייפלסנס ← הלגונה הכחולה',
      'הלגונה הכחולה · ארוחת פרידה',
      [
        ['11:00', 'הלגונה הכחולה', 'Norðurljósavegur 9', 'MORNING'],
        ['18:00', 'ארוחת פרידה', 'Grindavík', 'EVENING'],
      ],
    ],
    [
      '2026-09-06',
      'גרינדוויק ← קפלוויק',
      'החזרת הרכב · טיסה הביתה',
      [
        ['07:00', 'החזרת הרכב', 'KEF', 'MORNING'],
        ['09:40', 'טיסה הביתה', 'FI 562', 'MORNING'],
      ],
    ],
  ];

const SHARE_DAYPART_KEY = SHARE_DAYPART;

const days: SharedDay[] = DAYS.map(([date, title, summary, events], index) => {
  const byDaypart = new Map<string, { time: string; title: string; place: string }[]>();
  for (const [time, eventTitle, place, key] of events) {
    const daypart = SHARE_DAYPART_KEY[key];
    const bucket = byDaypart.get(daypart) ?? [];
    bucket.push({ time, title: eventTitle, place });
    byDaypart.set(daypart, bucket);
  }
  return {
    ordinal: index + 1,
    date,
    title,
    summary,
    sections: [...byDaypart.entries()].map(([daypart, bucket]) => ({
      daypart: daypart as SharedDay['sections'][number]['daypart'],
      events: bucket.map((event) => ({
        title: event.title,
        daypart: daypart as SharedDay['sections'][number]['daypart'],
        hard: event.title.includes('טיסה') || event.title.includes('נחיתה'),
        ...(event.time ? { startLabel: event.time } : {}),
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
    startDate: '2026-08-29',
    endDate: '2026-09-06',
    dayCount: 9,
    eventCount: days.reduce(
      (total, day) => total + day.sections.reduce((n, s) => n + s.events.length, 0),
      0,
    ),
    routeLabels: ['רייקיאוויק', 'מעגל הזהב', 'ויק', 'הפיורדים', 'אקוריירי', 'סנייפלסנס'],
  },
  narrative: {
    source: 'deterministic',
    title: 'רייקיאוויק ← סנייפלסנס',
    summary: '',
  },
  days,
};
