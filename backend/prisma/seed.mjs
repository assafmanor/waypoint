// Seeds the Tokyo demo trip (T-015) — mirrors frontend/src/fixtures.ts so wiring
// the frontend to the backend is a like-for-like swap. Idempotent: upsert by id,
// safe to re-run. Enum values are the lowercase Prisma literals (= @waypoint/shared).
// Run: pnpm --filter @waypoint/backend prisma:seed
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ME = 'u-assaf';
const TZ = '+09:00';
const TRIP_TZ = 'Asia/Tokyo'; // must match TRIP.timezone below
const date = (d) => `${d}T00:00:00Z`; // @db.Date — date part only
const addDays = (dateKey, days) => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// en-CA formats as YYYY-MM-DD — the trip's *local* calendar date, not UTC's
// (which can be a day off from Tokyo's).
const todayInTz = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

// DAY rolls to "today" (in the trip's own timezone) on every reseed, so the
// backend's real Date.now() guard (MOVE_INTO_PAST) never rejects moves on
// stale, calendar-pinned demo data — re-run `prisma:seed` to bring the demo
// trip back to the present.
const DAY = todayInTz(TRIP_TZ);
const CREATED_AT = `${DAY}T09:00:00Z`;
const at = (time) => `${DAY}T${time}:00${TZ}`;
// **A date-only deadline resolves to the day's END, in the trip's own zone** — the
// `DAY_DEADLINE_HHMM` convention the task editor writes (`frontend/src/constants.ts`, tasks
// brief §5). "By Thursday" is discharged any time on Thursday, so 00:00 would make a task
// due today read as overdue one minute past midnight. Seeding it any other way would give
// the notification sweep a shape the app never produces.
const dayEnd = (dateKey) => `${dateKey}T23:59:00${TZ}`;

const USERS = [
  { id: 'u-assaf', email: 'assaf@example.com', displayName: 'אסף' },
  { id: 'u-noam', email: 'noam@example.com', displayName: 'נועם' },
  { id: 'u-dana', email: 'dana@example.com', displayName: 'דנה' },
  { id: 'u-maor', email: 'maor@example.com', displayName: 'מאור' },
  { id: 'u-ron', email: 'ron@example.com', displayName: 'רון' },
];

const TRIP = {
  id: 'trip-japan-26',
  name: 'יפן ׳26',
  destination: 'טוקיו',
  startDate: date(addDays(DAY, -2)),
  endDate: date(addDays(DAY, 7)),
  timezone: 'Asia/Tokyo',
  currency: 'JPY',
  createdBy: ME,
  updatedBy: ME,
};

// The trip-scoped location registry (ADR-0048). Name-only "Place-lite" rows — the
// Google Places picker (Maps work) fills in googlePlaceId/lat/lng later.
const PLACES = [
  { id: 'pl-asakusa', name: 'אסקוסה' },
  { id: 'pl-tsukiji', name: 'שוק צוקיג׳י' },
  { id: 'pl-senso', name: 'מקדש סנסו-ג׳י' },
  { id: 'pl-shinjuku', name: 'שינג׳וקו' },
  { id: 'pl-goldengai', name: 'גולדן גאי' },
  { id: 'pl-granbell', name: 'Shinjuku Granbell Hotel', address: 'Shinjuku, Tokyo' },
  { id: 'pl-tlv', name: 'נתב״ג (TLV)' },
  { id: 'pl-nrt', name: 'נמל התעופה נריטה (NRT)' },
].map((p) => ({ ...p, tripId: TRIP.id, updatedBy: ME }));

const BOOKINGS = [
  {
    id: 'bk-ichiran',
    tripId: TRIP.id,
    type: 'restaurant',
    title: 'Ichiran Ramen',
    confirmationCode: '4471',
    placeId: 'pl-shinjuku',
    source: 'manual',
    updatedBy: ME,
  },
  // Hotel WiFi lives on the hotel booking's details blob now (ADR-0047), not a TripNote.
  {
    id: 'bk-hotel',
    tripId: TRIP.id,
    type: 'hotel',
    title: 'Shinjuku Granbell',
    confirmationCode: 'GRB-88',
    placeId: 'pl-granbell',
    details: { wifi: { network: 'GRANBELL-512', password: 'tokyo2026' } },
    source: 'manual',
    updatedBy: ME,
  },
  // Transport carries origin/destination Places (ADR-0048); index-only (no linked event).
  {
    id: 'bk-flight',
    tripId: TRIP.id,
    type: 'flight',
    title: 'טיסה TLV → NRT',
    confirmationCode: 'LY075',
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-nrt',
    source: 'manual',
    updatedBy: ME,
  },
];

// A linked event's place lives on its booking (ADR-0048), so it carries no placeId;
// unlinked events reference a Place directly.
const EVENTS = [
  // A long "envelope" the morning stops happen inside — demos the concurrency
  // nesting (ADR-0041): שוק צוקיג׳י + מקדש סנסו-ג׳י nest under it as "כולל 2".
  {
    id: 'ev-daytour',
    title: 'סיור יום בטוקיו',
    icon: '🗺️',
    category: 'sightseeing',
    kind: 'soft',
    status: 'done',
    startsAt: at('10:00'),
    endsAt: at('16:00'),
    placeId: 'pl-asakusa',
    sortOrder: 0,
  },
  {
    id: 'ev-tsukiji',
    title: 'שוק צוקיג׳י',
    icon: '🐟',
    category: 'food',
    kind: 'soft',
    status: 'done',
    startsAt: at('10:00'),
    endsAt: at('12:00'),
    placeId: 'pl-tsukiji',
    sortOrder: 1,
  },
  {
    id: 'ev-senso',
    title: 'מקדש סנסו-ג׳י',
    icon: '⛩️',
    category: 'sightseeing',
    kind: 'soft',
    status: 'done',
    startsAt: at('14:30'),
    endsAt: at('16:00'),
    placeId: 'pl-senso',
    sortOrder: 2,
  },
  {
    id: 'ev-shinjuku',
    title: 'זמן חופשי · שינג׳וקו',
    icon: '🚶',
    category: 'other',
    kind: 'soft',
    status: 'planned',
    startsAt: at('16:30'),
    endsAt: at('19:30'),
    placeId: 'pl-shinjuku',
    sortOrder: 3,
  },
  {
    id: 'ev-ichiran',
    title: 'Ichiran Ramen',
    icon: '🍜',
    // **The category is what `event.hard.soon` reads**, through `CATEGORY_TIME_PROFILE`'s
    // `notifyLeadMinutes` (ADR-0198 §3): `food` is 30 minutes, and an event with no category
    // at all is not notified ahead of time. Every event here was categoryless before phase B,
    // which made the whole kind invisible against the seed.
    category: 'food',
    kind: 'hard',
    status: 'planned',
    startsAt: at('19:30'),
    endsAt: at('21:00'),
    bookingId: 'bk-ichiran',
    sortOrder: 4,
  },
  // **The hotel span, and it is the only ambient row in the seed** — so it is the only thing
  // `span.edge.soon` can fire for. `endDate` set and later than `date` is what makes it
  // ambient (ADR-0018/0054), which is also what keeps it OUT of `event.hard.soon`: a check-in
  // fired by both kinds an hour apart is the double-count ADR-0164 §3 exists to prevent.
  //
  // `startWindowEnd` is ADR-0184's flexible edge, and it is the interesting half: reception
  // opens at 15:00 and the room is held until 22:00, so the thing you can actually MISS is
  // 22:00 and that is what the edge aims at. `endWindowStart` is the mirror on the way out —
  // the earliest you may check out — which is a floor and not a deadline, so nothing fires
  // for it.
  {
    id: 'ev-hotel-stay',
    title: 'Shinjuku Granbell',
    icon: '🏨',
    category: 'lodging',
    kind: 'hard',
    status: 'planned',
    date: date(addDays(DAY, -2)),
    endDate: date(addDays(DAY, 5)),
    startsAt: `${addDays(DAY, -2)}T15:00:00${TZ}`,
    startWindowEnd: `${addDays(DAY, -2)}T22:00:00${TZ}`,
    endsAt: `${addDays(DAY, 5)}T11:00:00${TZ}`,
    endWindowStart: `${addDays(DAY, 5)}T07:00:00${TZ}`,
    bookingId: 'bk-hotel',
    sortOrder: 0,
  },
  // The outbound flight. `transport` carries the catalogue's longest lead — two hours, because
  // an airport is the one place where that is not paranoid — and the ✈️ glyph is what refines
  // its wording to take-off/landing through `ICON_TIME_PROFILE`.
  //
  // Single-day on purpose: a flight with an `endDate` would be ambient and belong to
  // `span.edge.soon` instead, which is true of a red-eye and is a different fixture.
  {
    id: 'ev-flight-out',
    title: 'טיסה TLV → NRT',
    icon: '✈️',
    category: 'transport',
    kind: 'hard',
    status: 'planned',
    date: date(addDays(DAY, -2)),
    startsAt: `${addDays(DAY, -2)}T06:20:00+03:00`,
    endsAt: `${addDays(DAY, -2)}T22:15:00${TZ}`,
    bookingId: 'bk-flight',
    sortOrder: 1,
  },
  {
    id: 'ev-goldengai',
    title: 'גולדן גאי',
    icon: '🍶',
    category: 'food',
    kind: 'soft',
    status: 'planned',
    startsAt: at('21:30'),
    endsAt: at('22:30'),
    placeId: 'pl-goldengai',
    sortOrder: 5,
  },
  // Partially overlaps גולדן גאי (22:00–22:30) but neither contains the other —
  // demos the partial-overlap cluster + the "הזז" resolve (ADR-0041).
  {
    id: 'ev-cocktail',
    title: 'בר קוקטיילים',
    icon: '🍸',
    category: 'food',
    kind: 'soft',
    status: 'planned',
    startsAt: at('22:00'),
    endsAt: at('22:45'),
    placeId: 'pl-shinjuku',
    sortOrder: 6,
  },
  {
    id: 'ev-walkback',
    title: 'חזרה למלון · הליכה',
    icon: '🌙',
    category: 'other',
    kind: 'soft',
    status: 'planned',
    startsAt: at('22:45'),
    endsAt: at('23:15'),
    placeId: 'pl-shinjuku',
    sortOrder: 7,
  },
  // `date` defaults to today so the one-day demo rows roll with a reseed — but an event that
  // states its OWN day keeps it, which the hotel span and the outbound flight both do. Written
  // as a fallback rather than an override because the override silently ate them.
].map((e) => ({
  ...e,
  tripId: TRIP.id,
  date: e.date ?? date(DAY),
  source: 'manual',
  updatedBy: ME,
}));

// **The tasks, and the reason they are the notification epic's blocker rather than a chore.**
//
// `grep -c dueAt prisma/seed.mjs` was 0 before this: the demo trip had no tasks at all, so
// ADR-0198's phase A had nothing to fire against and no way to be seen working. These cover
// the catalogue's own cases deliberately, not decoratively:
//
//   · dated WITH an hour, today       → `task.due` fires at that hour
//   · dated with NO hour              → `task.due` must NOT fire; the digest counts it
//   · overdue and still open          → the digest counts it as part of today (no separate nag)
//   · due tomorrow                    → the digest names it in its tail
//   · assigned to somebody else       → `task.assigned`, once
//   · unassigned ("one of us")        → `task.due` reaches the whole group
//   · undated                         → never notified, at any preference
//   · settled                         → never notified, and keeps the index scan honest
//
// `dueAt` is built from `DAY`, so a reseed rolls them to the present exactly as the events do.
const TASKS = [
  {
    id: 'tk-passports',
    title: 'לצלם דרכונים ולהעלות',
    dueAt: at('18:00'),
    dueHasTime: true,
    assigneeUserId: null,
    important: true,
  },
  {
    id: 'tk-insurance',
    title: 'ביטוח נסיעות לכולם',
    // A day with no hour, which is most of what anybody writes weeks out — and the reason
    // the digest exists at all.
    dueAt: dayEnd(DAY),
    dueHasTime: false,
    assigneeUserId: 'u-dana',
  },
  {
    id: 'tk-jr-pass',
    title: 'להזמין JR Pass',
    dueAt: dayEnd(addDays(DAY, -3)),
    dueHasTime: false,
    assigneeUserId: ME,
  },
  {
    id: 'tk-sim',
    title: 'כרטיס SIM בשדה התעופה',
    dueAt: `${addDays(DAY, 1)}T11:00:00${TZ}`,
    dueHasTime: true,
    assigneeUserId: null,
  },
  {
    id: 'tk-yen',
    title: 'להחליף ין במזומן',
    // Assigned BY somebody else TO me, which is the only shape `task.assigned` fires for.
    dueAt: null,
    dueHasTime: false,
    assigneeUserId: ME,
    assignedAt: CREATED_AT,
    updatedBy: 'u-noam',
  },
  {
    id: 'tk-slippers',
    title: 'נעלי בית לאונסן',
    dueAt: null,
    dueHasTime: false,
    assigneeUserId: null,
  },
  {
    id: 'tk-visas',
    title: 'לבדוק ויזות',
    dueAt: dayEnd(addDays(DAY, -5)),
    dueHasTime: false,
    assigneeUserId: ME,
    status: 'done',
    settledAt: CREATED_AT,
    settledBy: ME,
  },
].map((t) => ({
  ...t,
  tripId: TRIP.id,
  createdBy: ME,
  updatedBy: t.updatedBy ?? ME,
}));

const MAYBE_ITEMS = [
  { id: 'mb-skytree', title: 'טוקיו סקייטרי', icon: '🗼' },
  { id: 'mb-catcafe', title: 'קפה חתולים', icon: '🐱' },
  { id: 'mb-uniqlo', title: 'Uniqlo פלאגשיפ', icon: '🛍️' },
  { id: 'mb-ameyoko', title: 'אמאיוקוצ׳ו', icon: '🍡' },
].map((m) => ({ ...m, tripId: TRIP.id, createdBy: ME, consumed: false, updatedBy: ME }));

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: { ...u, createdAt: CREATED_AT },
      update: u,
    });
  }
  await prisma.trip.upsert({
    where: { id: TRIP.id },
    create: { ...TRIP, createdAt: CREATED_AT },
    update: TRIP,
  });
  // **The whole group, not just me.** The demo trip had one membership, so every
  // group-shaped behaviour — "one of us" reaching everybody, an assignment coming FROM
  // somebody, the roster's avatars — was untestable against the seed. The other four users
  // already existed; only their memberships were missing.
  for (const u of USERS) {
    const role = u.id === ME ? 'admin' : 'peer';
    await prisma.membership.upsert({
      where: { tripId_userId: { tripId: TRIP.id, userId: u.id } },
      create: { tripId: TRIP.id, userId: u.id, role },
      update: { role },
    });
  }
  // Places first — bookings/events reference them by FK.
  for (const p of PLACES) {
    await prisma.place.upsert({
      where: { id: p.id },
      create: { ...p, createdAt: CREATED_AT },
      update: p,
    });
  }
  for (const b of BOOKINGS) {
    await prisma.booking.upsert({
      where: { id: b.id },
      create: { ...b, createdAt: CREATED_AT },
      update: b,
    });
  }
  for (const e of EVENTS) {
    await prisma.event.upsert({
      where: { id: e.id },
      create: { ...e, createdAt: CREATED_AT },
      update: e,
    });
  }
  for (const t of TASKS) {
    await prisma.task.upsert({
      where: { id: t.id },
      create: { ...t, createdAt: CREATED_AT },
      update: t,
    });
  }
  for (const m of MAYBE_ITEMS) {
    await prisma.maybeItem.upsert({
      where: { id: m.id },
      create: { ...m, createdAt: CREATED_AT },
      update: m,
    });
  }
  console.log(
    `Seeded: ${USERS.length} users, 1 trip, ${USERS.length} memberships, ${PLACES.length} places, ` +
      `${BOOKINGS.length} bookings, ${EVENTS.length} events, ${TASKS.length} tasks, ` +
      `${MAYBE_ITEMS.length} maybe-items.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
