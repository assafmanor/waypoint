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

const USERS = [
  { id: 'u-assaf', email: 'assaf@example.com', displayName: 'אסף', avatarColor: '#E9A63C' },
  { id: 'u-noam', email: 'noam@example.com', displayName: 'נועם', avatarColor: '#5EC5B6' },
  { id: 'u-dana', email: 'dana@example.com', displayName: 'דנה', avatarColor: '#E88C8C' },
  { id: 'u-maor', email: 'maor@example.com', displayName: 'מאור', avatarColor: '#9C8CE8' },
  { id: 'u-ron', email: 'ron@example.com', displayName: 'רון', avatarColor: '#8CB6E8' },
];

const TRIP = {
  id: 'trip-japan-26',
  name: 'יפן ׳26',
  destination: 'טוקיו',
  startDate: date(addDays(DAY, -2)),
  endDate: date(addDays(DAY, 7)),
  timezone: 'Asia/Tokyo',
  currency: 'JPY',
  dailyBudgetMinor: 14000,
  createdBy: ME,
  updatedBy: ME,
};

const BOOKINGS = [
  {
    id: 'bk-ichiran',
    tripId: TRIP.id,
    type: 'restaurant',
    title: 'Ichiran Ramen',
    confirmationCode: '4471',
    source: 'manual',
    updatedBy: ME,
  },
];

const EVENTS = [
  {
    id: 'ev-tsukiji',
    title: 'שוק צוקיג׳י',
    icon: '🐟',
    kind: 'soft',
    status: 'done',
    startsAt: at('10:00'),
    endsAt: at('12:00'),
    location: 'ארוחת בוקר · סושי טרי',
    sortOrder: 1,
  },
  {
    id: 'ev-senso',
    title: 'מקדש סנסו-ג׳י',
    icon: '⛩️',
    kind: 'soft',
    status: 'done',
    startsAt: at('14:30'),
    endsAt: at('16:00'),
    location: 'אסקוסה · נקמיסה',
    sortOrder: 2,
  },
  {
    id: 'ev-shinjuku',
    title: 'זמן חופשי · שינג׳וקו',
    icon: '🚶',
    kind: 'soft',
    status: 'planned',
    startsAt: at('16:30'),
    endsAt: at('19:30'),
    location: 'מתחם החנויות',
    sortOrder: 3,
  },
  {
    id: 'ev-ichiran',
    title: 'Ichiran Ramen',
    icon: '🍜',
    kind: 'hard',
    status: 'planned',
    startsAt: at('19:30'),
    endsAt: at('21:00'),
    location: 'ארוחת ערב',
    bookingId: 'bk-ichiran',
    sortOrder: 4,
  },
  {
    id: 'ev-goldengai',
    title: 'גולדן גאי',
    icon: '🍶',
    kind: 'soft',
    status: 'planned',
    startsAt: at('21:30'),
    endsAt: at('22:30'),
    location: 'דרינקים · סמטאות באר',
    sortOrder: 5,
  },
  {
    id: 'ev-walkback',
    title: 'חזרה למלון · הליכה',
    icon: '🌙',
    kind: 'soft',
    status: 'planned',
    startsAt: at('22:45'),
    endsAt: at('23:15'),
    location: 'שינג׳וקו',
    sortOrder: 6,
  },
].map((e) => ({ ...e, tripId: TRIP.id, date: date(DAY), source: 'manual', updatedBy: ME }));

const MAYBE_ITEMS = [
  { id: 'mb-skytree', title: 'טוקיו סקייטרי', icon: '🗼' },
  { id: 'mb-catcafe', title: 'קפה חתולים', icon: '🐱' },
  { id: 'mb-uniqlo', title: 'Uniqlo פלאגשיפ', icon: '🛍️' },
  { id: 'mb-ameyoko', title: 'אמאיוקוצ׳ו', icon: '🍡' },
].map((m) => ({ ...m, tripId: TRIP.id, createdBy: ME, consumed: false, updatedBy: ME }));

const NOTES = [
  {
    id: 'nt-wifi',
    tripId: TRIP.id,
    category: 'wifi',
    label: 'WiFi המלון',
    value: 'GRANBELL-512 / tokyo2026',
    sortOrder: 1,
    updatedBy: ME,
  },
];

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
  await prisma.membership.upsert({
    where: { tripId_userId: { tripId: TRIP.id, userId: ME } },
    create: { tripId: TRIP.id, userId: ME, role: 'admin' },
    update: { role: 'admin' },
  });
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
  for (const m of MAYBE_ITEMS) {
    await prisma.maybeItem.upsert({
      where: { id: m.id },
      create: { ...m, createdAt: CREATED_AT },
      update: m,
    });
  }
  for (const n of NOTES) {
    await prisma.tripNote.upsert({
      where: { id: n.id },
      create: { ...n, createdAt: CREATED_AT },
      update: n,
    });
  }
  console.log(
    `Seeded: ${USERS.length} users, 1 trip, 1 membership, ${BOOKINGS.length} booking, ${EVENTS.length} events, ${MAYBE_ITEMS.length} maybe-items, ${NOTES.length} note.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
