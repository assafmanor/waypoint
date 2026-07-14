// The Tokyo demo trip — local fixture data until the API lands (T-014).
// Typed against @waypoint/shared so the screens compile the same way they will
// once wired to snapshot/changes. Day 3 of a 10-day Japan trip.
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TRIP_NOTE_CATEGORY,
  type Booking,
  type MaybeItem,
  type Trip,
  type TripEvent,
  type TripNote,
  type User,
} from '@waypoint/shared';

/** Asia/Tokyo has no DST, so a fixed offset is enough for building demo instants. */
export const TRIP_TZ_OFFSET = '+09:00';

/** The active day the screens render (day 3). */
export const ACTIVE_DATE = '2026-07-07';

/** Demo clock anchor: 18:52 local on the active day — matches the mockup.
 *  The real build reads the wall clock; see useClock(). */
export const DEMO_NOW = new Date(`2026-07-07T18:52:00${TRIP_TZ_OFFSET}`);

const NOW_ISO = '2026-07-07T09:00:00Z';
const ME = 'u-assaf';

export const USERS: User[] = [
  {
    id: 'u-assaf',
    email: 'assaf@example.com',
    displayName: 'אסף',
    avatarColor: '#E9A63C',
    createdAt: NOW_ISO,
  },
  {
    id: 'u-noam',
    email: 'noam@example.com',
    displayName: 'נועם',
    avatarColor: '#5EC5B6',
    createdAt: NOW_ISO,
  },
  {
    id: 'u-dana',
    email: 'dana@example.com',
    displayName: 'דנה',
    avatarColor: '#E88C8C',
    createdAt: NOW_ISO,
  },
  {
    id: 'u-maor',
    email: 'maor@example.com',
    displayName: 'מאור',
    avatarColor: '#9C8CE8',
    createdAt: NOW_ISO,
  },
  {
    id: 'u-ron',
    email: 'ron@example.com',
    displayName: 'רון',
    avatarColor: '#8CB6E8',
    createdAt: NOW_ISO,
  },
];

export const TRIP: Trip = {
  id: 'trip-japan-26',
  name: 'יפן ׳26',
  destination: 'טוקיו',
  startDate: '2026-07-05',
  endDate: '2026-07-14',
  timezone: 'Asia/Tokyo',
  currency: 'JPY',
  dailyBudgetMinor: 14000,
  createdBy: ME,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  updatedBy: ME,
};

export const BOOKINGS: Booking[] = [
  {
    id: 'bk-flight-out',
    tripId: TRIP.id,
    type: BOOKING_TYPE.FLIGHT,
    title: 'ANA · TLV→HND',
    confirmationCode: '7K2QLP',
    provider: 'ANA',
    source: BOOKING_SOURCE.MANUAL,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
  {
    id: 'bk-granbell',
    tripId: TRIP.id,
    type: BOOKING_TYPE.HOTEL,
    title: 'Shinjuku Granbell',
    confirmationCode: 'GB-2291',
    source: BOOKING_SOURCE.MANUAL,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
  {
    id: 'bk-ichiran',
    tripId: TRIP.id,
    type: BOOKING_TYPE.RESTAURANT,
    title: 'Ichiran Ramen',
    confirmationCode: '4471',
    source: BOOKING_SOURCE.MANUAL,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
];

const at = (time: string) => `${ACTIVE_DATE}T${time}:00${TRIP_TZ_OFFSET}`;

const base = {
  tripId: TRIP.id,
  date: ACTIVE_DATE,
  source: EVENT_SOURCE.MANUAL,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  updatedBy: ME,
};

// Day 3 (the active demo day) — Trip-mode Home/DayView render these; their
// now/next and countdown are pinned by time.test.ts, so keep this set and its
// order stable (EVENTS[0] === ev-tsukiji).
const DAY3_EVENTS: TripEvent[] = [
  {
    ...base,
    id: 'ev-tsukiji',
    title: 'שוק צוקיג׳י',
    icon: '🐟',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.DONE,
    startsAt: at('10:00'),
    endsAt: at('12:00'),
    location: 'ארוחת בוקר · סושי טרי',
    sortOrder: 1,
  },
  {
    ...base,
    id: 'ev-senso',
    title: 'מקדש סנסו-ג׳י',
    icon: '⛩️',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.DONE,
    startsAt: at('14:30'),
    endsAt: at('16:00'),
    location: 'אסקוסה · נקמיסה',
    sortOrder: 2,
  },
  {
    ...base,
    id: 'ev-shinjuku',
    title: 'זמן חופשי · שינג׳וקו',
    icon: '🚶',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    startsAt: at('16:30'),
    endsAt: at('19:30'),
    location: 'מתחם החנויות',
    sortOrder: 3,
  },
  {
    ...base,
    id: 'ev-ichiran',
    title: 'Ichiran Ramen',
    icon: '🍜',
    kind: EVENT_KIND.HARD,
    status: EVENT_STATUS.PLANNED,
    startsAt: at('19:30'),
    endsAt: at('21:00'),
    location: 'ארוחת ערב',
    bookingId: 'bk-ichiran',
    sortOrder: 4,
  },
  {
    ...base,
    id: 'ev-goldengai',
    title: 'גולדן גאי',
    icon: '🍶',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    startsAt: at('21:30'),
    endsAt: at('22:30'),
    location: 'דרינקים · סמטאות באר',
    sortOrder: 5,
  },
  {
    ...base,
    id: 'ev-walkback',
    title: 'חזרה למלון · הליכה',
    icon: '🌙',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    startsAt: at('22:45'),
    endsAt: at('23:15'),
    location: 'שינג׳וקו',
    sortOrder: 6,
  },
];

// Events on other days, so the whole-trip Plan-mode prep dashboard reads
// believably (a real spread of planned days with a few gaps) instead of "9 of
// 10 days empty". Deliberately none on day 3 (07-07) and none between the
// day-3 now/next instants the tests pin — all sit on earlier/later calendar
// days. Days 07-10, 07-12 and 07-14 are left empty on purpose (the prep
// dashboard's "3 ימים ללא תוכנית" row).
const spreadBase = {
  tripId: TRIP.id,
  source: EVENT_SOURCE.MANUAL,
  status: EVENT_STATUS.PLANNED,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  updatedBy: ME,
} as const;
const dayAt = (date: string, time: string) => `${date}T${time}:00${TRIP_TZ_OFFSET}`;
const spread = (
  id: string,
  date: string,
  title: string,
  icon: string,
  start: string,
  end: string,
  extra: Partial<TripEvent> = {},
): TripEvent => ({
  ...spreadBase,
  id,
  date,
  title,
  icon,
  kind: EVENT_KIND.SOFT,
  startsAt: dayAt(date, start),
  endsAt: dayAt(date, end),
  sortOrder: 1,
  ...extra,
});

const SPREAD_EVENTS: TripEvent[] = [
  // 07-05 · arrival
  spread('ev-arrival', '2026-07-05', 'נחיתה בטוקיו · HND', '🛬', '16:40', '18:10', {
    kind: EVENT_KIND.HARD,
    bookingId: 'bk-flight-out',
    location: 'שדה התעופה הנדה',
  }),
  spread('ev-checkin', '2026-07-05', 'צ׳ק-אין · גרנבל', '🏨', '19:30', '20:15', {
    bookingId: 'bk-granbell',
    sortOrder: 2,
  }),
  // 07-06
  spread('ev-shibuya', '2026-07-06', 'צומת שיבויה', '🏙️', '11:00', '13:00'),
  spread('ev-harajuku', '2026-07-06', 'הרג׳וקו · טאקשיטה', '🛍️', '15:00', '17:30', {
    sortOrder: 2,
  }),
  // 07-08
  spread('ev-teamlab', '2026-07-08', 'teamLab Planets', '🎨', '10:00', '12:30'),
  // 07-09
  spread('ev-fuji', '2026-07-09', 'הר פוג׳י · טיול יום', '🗻', '08:30', '18:00'),
  // 07-11
  spread('ev-fushimi', '2026-07-11', 'פושימי אינארי', '⛩️', '10:00', '12:30'),
  // 07-13
  spread('ev-arashiyama', '2026-07-13', 'יער הבמבוק ארשיאמה', '🎋', '09:30', '11:30'),
];

export const EVENTS: TripEvent[] = [...DAY3_EVENTS, ...SPREAD_EVENTS];

export const MAYBE_ITEMS: MaybeItem[] = [
  {
    id: 'mb-skytree',
    tripId: TRIP.id,
    title: 'טוקיו סקייטרי',
    icon: '🗼',
    createdBy: ME,
    consumed: false,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
  {
    id: 'mb-catcafe',
    tripId: TRIP.id,
    title: 'קפה חתולים',
    icon: '🐱',
    createdBy: ME,
    consumed: false,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
  {
    id: 'mb-uniqlo',
    tripId: TRIP.id,
    title: 'Uniqlo פלאגשיפ',
    icon: '🛍️',
    createdBy: ME,
    consumed: false,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
  {
    id: 'mb-ameyoko',
    tripId: TRIP.id,
    title: 'אמאיוקוצ׳ו',
    icon: '🍡',
    createdBy: ME,
    consumed: false,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
];

const MAYBE_META: Record<string, string> = {
  'mb-skytree': 'נוף · תצפית',
  'mb-catcafe': 'שינג׳וקו · קרוב',
  'mb-uniqlo': 'גינזה · קניות',
  'mb-ameyoko': 'אוכל רחוב',
};
export const maybeMeta = (id: string) => MAYBE_META[id] ?? '';

export const NOTES: TripNote[] = [
  {
    id: 'nt-wifi',
    tripId: TRIP.id,
    category: TRIP_NOTE_CATEGORY.WIFI,
    label: 'WiFi המלון',
    value: 'GRANBELL-512 / tokyo2026',
    sortOrder: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    updatedBy: ME,
  },
];

/** Glance widgets pull from integrations later (ADR-0004); static demo values for now. */
export const GLANCE = {
  weather: { tempC: 18, note: 'גשם קל אחרי חצות' },
  fx: { label: '¥1=₪0.024', changePct: 0.3 },
  budget: { spentMinor: 8200 },
};

export const activeUserId = ME;
