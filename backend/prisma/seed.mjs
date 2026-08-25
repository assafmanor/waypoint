// Seeds the Tokyo demo trip (T-015) — mirrors frontend/src/fixtures.ts so wiring
// the frontend to the backend is a like-for-like swap — plus a second, routable road
// trip (see the Iceland section). Idempotent: upsert by id, safe to re-run. Enum
// values are the lowercase Prisma literals (= @waypoint/shared).
// Run: pnpm --filter @waypoint/backend prisma:seed
//
// **This file is the routes epic's fixture** (ADR-0205 §Z0). Every coordinate and every
// consecutive pair below is chosen to exercise one named path through `TRAVEL_GATE`, and the
// two tables — above `PLACES` and above the Iceland trip — say which. Distances there were
// measured with the shipped `haversineMeters` / `clusterLatLngs`, not estimated.
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

// The trip-scoped location registry (ADR-0048), and since 2026-08-25 a **routable** one.
//
// These rows were name-only Place-lite (ADR-0147) with `lat`/`lng` `null`, which ADR-0205 §Z0
// recorded as a blocker for the whole routes epic rather than a quirk: M4–M11 all need a routable
// trip and the seed could not supply one. They are real places, so they get their real coordinates
// — the ones a Places pick would have filled — plus the `timezone` the picker resolves from the
// coordinate through geo-tz (`places.service.ts`), because a coordinate with no zone is a row the
// app never writes. `googlePlaceId` stays null: it is a real Google id or it is nothing.
//
// **Which gate path each of this trip's consecutive pairs is for.** Measured with the shipped
// `haversineMeters` and `clusterLatLngs` at `MAP_AREA_LINK_RADIUS_M`, read against `TRAVEL_GATE`:
//
//   Asakusa    → Tsukiji      5.59 km  all modes  ┐ THE WALKABLE DAY: every leg is inside
//   Tsukiji    → Senso-ji     5.97 km  all modes  ┤ walking's 15 km, so all three modes answer
//   Senso-ji   → Shinjuku     9.12 km  all modes  ┤ and M8's control has something to switch
//   Shinjuku   → Shinjuku     0.00 km  REFUSED    ┤ between. The 9.12 km leg is the 127-minute
//   Shinjuku   → Golden Gai   0.61 km  all modes  ┤ walk §Z2 called absurd — admitted on
//   Golden Gai → Shinjuku     0.61 km  all modes  ┤ purpose, since §Z8 raised the ceiling.
//   Shinjuku   → Shinjuku     0.00 km  REFUSED    ┘
//   Ueno       → Ginza        4.86 km  all modes    DAY+1 — sized so travel eats a gap (below).
//
// The two 0.00 km legs are `ROUTE_MIN_CROW_M`'s floor and are kept exactly as they were: four
// events share `pl-shinjuku`, which is the pair §Z2 measured the 10 m floor against, and an empty
// admitted set there is ADR-0206 §D4's ordinary absence — the two stops ARE one place.
//
// TLV → NRT is 9,203.02 km and refused by every ceiling. Not a day leg — it is the flight
// booking's own two endpoints — and ADR-0011 is why that is right: nobody estimates a flight.
//
// The eight city places are ONE cluster; NRT and TLV are each their own. The deliberate
// multi-cluster fixture is the Iceland trip below, where driving crosses clusters to exist at all.
const PLACES = [
  { id: 'pl-asakusa', name: 'אסקוסה', lat: 35.7107, lng: 139.7975 },
  { id: 'pl-tsukiji', name: 'שוק צוקיג׳י', lat: 35.6654, lng: 139.7707 },
  { id: 'pl-senso', name: 'מקדש סנסו-ג׳י', lat: 35.7148, lng: 139.7967 },
  { id: 'pl-shinjuku', name: 'שינג׳וקו', lat: 35.6896, lng: 139.7006 },
  { id: 'pl-goldengai', name: 'גולדן גאי', lat: 35.6939, lng: 139.7048 },
  {
    id: 'pl-granbell',
    name: 'Shinjuku Granbell Hotel',
    address: 'Shinjuku, Tokyo',
    lat: 35.6947,
    lng: 139.7023,
  },
  // The one place outside Japan, and the only reason `timezone` is not a constant below.
  { id: 'pl-tlv', name: 'נתב״ג (TLV)', lat: 32.0114, lng: 34.8867, timezone: 'Asia/Jerusalem' },
  { id: 'pl-nrt', name: 'נמל התעופה נריטה (NRT)', lat: 35.772, lng: 140.3929 },
  // **DAY+1, and the two rows below it are the whole reason these exist** (ADR-0206 §V1.1).
  { id: 'pl-ueno', name: 'פארק אואנו', lat: 35.7148, lng: 139.7737 },
  { id: 'pl-ginza', name: 'גינזה', lat: 35.6717, lng: 139.765 },
].map((p) => ({ ...p, tripId: TRIP.id, timezone: p.timezone ?? TRIP_TZ, updatedBy: ME }));

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
  // **DAY+1 exists for one read: the gap travel genuinely eats** (ADR-0206 §V1.1, which corrects
  // ADR-0159 §1 — `פנוי · 2:30 שע׳` counts the walk as free time and has since it shipped).
  //
  // Its own day, deliberately, so nothing about today's rows had to move: two plain stops, no
  // booking, no envelope, and a 2:30 hole between them holding 4.86 km of walking — ~69 min at
  // §Z2's measured 4.9 km/h over §Z7's 1.16 median road/crow. So the honest read is ~1:20 free,
  // and the overstatement is 70 minutes wide. Both numbers clear `GAP_MIN_MINUTES`, so the slot
  // renders a chip before AND after the fix, which is what makes the correction observable rather
  // than merely true.
  {
    id: 'ev-ueno',
    title: 'פארק אואנו',
    icon: '🌳',
    category: 'nature',
    kind: 'soft',
    status: 'planned',
    date: date(addDays(DAY, 1)),
    startsAt: `${addDays(DAY, 1)}T09:30:00${TZ}`,
    endsAt: `${addDays(DAY, 1)}T11:00:00${TZ}`,
    placeId: 'pl-ueno',
    sortOrder: 0,
  },
  {
    id: 'ev-ginza',
    title: 'גינזה · קניות',
    icon: '🛍️',
    category: 'shopping',
    kind: 'soft',
    status: 'planned',
    date: date(addDays(DAY, 1)),
    startsAt: `${addDays(DAY, 1)}T13:30:00${TZ}`,
    endsAt: `${addDays(DAY, 1)}T15:00:00${TZ}`,
    placeId: 'pl-ginza',
    sortOrder: 1,
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

// ── THE SECOND TRIP: a car, and the legs a city day cannot have ─────────────────────────────────
//
// **Why the seed needs two trips.** M8 derives a trip's default travel mode from its bookings
// (ADR-0206 §Z2), and Tokyo is a flight, a hotel and a restaurant — a trip that can never infer
// driving however many coordinates it grows. Nor can a city day cross a cluster: the eight Tokyo
// city places are one area at ADR-0186 §4's 40 km link radius. So the driving half of the gate needs a
// road trip, and it gets the one ADR-0205 §Z0 already measured as an archetype and §Z9 asked its
// ceiling of: ADR-0162's car hire on the Iceland ring road.
//
// Placed 30 days out so it never competes with the Tokyo trip for "today" — its legs are what make
// it interesting, not its dates.
//
// **Which gate path each day's pair is for** (same measurement as the Tokyo table above):
//
//   D+0  Blue Lagoon → Reykjavík    38.55 km  ONE cluster and STILL driving-only: over walking's
//                                             15 km and cycling's 20 km. The pair that separates
//                                             the two halves of the gate — distance refuses here,
//                                             the cluster test does not.
//   D+1  Reykjavík   → Vík         165.39 km  THE MULTI-CLUSTER PAIR. Only `driving` sets
//                                             `sameClusterOnly: false`, and this is why — a road
//                                             trip crosses clusters by definition. Its 4:30 gap
//                                             holds ~2:40 of driving, so §V1.1's correction is
//                                             observable in the other mode too.
//   D+2  Vík         → Höfn        208.04 km  the longest leg the 300 km ceiling admits, and the
//                                             pair §Z2 measured at 209.7 km crow.
//   D+3  Höfn        → Reykjavík   325.98 km  REFUSED, by every mode — over the driving ceiling.
//                                             **A feature, not an error path** (ADR-0206 §D4): the
//                                             crow-flies chip is the answer, and §Z9 asked this
//                                             exact drive whether the ceiling could be raised and
//                                             said no — the provider's own 400 km path limit
//                                             cannot route it either.
const ICE_TZ = 'Atlantic/Reykjavik';
const ICE_TZ_OFFSET = '+00:00'; // Iceland stays on UTC all year — no DST for a reseed to drift over
const ICE_DAY = addDays(DAY, 30);
const iceDay = (n) => addDays(ICE_DAY, n);
const iceAt = (n, time) => `${iceDay(n)}T${time}:00${ICE_TZ_OFFSET}`;

const ICE_TRIP = {
  id: 'trip-iceland-26',
  name: 'איסלנד ׳26',
  destination: 'רייקיאוויק',
  startDate: date(ICE_DAY),
  endDate: date(iceDay(4)),
  timezone: ICE_TZ,
  currency: 'ISK',
  createdBy: ME,
  updatedBy: ME,
};

const ICE_PLACES = [
  { id: 'pl-ice-kef', name: 'נמל התעופה קפלאוויק (KEF)', lat: 63.985, lng: -22.6056 },
  { id: 'pl-ice-bluelagoon', name: 'הלגונה הכחולה', lat: 63.8804, lng: -22.4495 },
  { id: 'pl-ice-reykjavik', name: 'רייקיאוויק', lat: 64.1466, lng: -21.9426 },
  { id: 'pl-ice-vik', name: 'ויק', lat: 63.4187, lng: -19.006 },
  { id: 'pl-ice-hofn', name: 'הופן', lat: 64.2539, lng: -15.2082 },
].map((p) => ({ ...p, tripId: ICE_TRIP.id, timezone: ICE_TZ, updatedBy: ME }));

// **The whole point of the trip** (ADR-0162): `car` is route-shaped with no mirrored return leg,
// and both ends being the same counter is the common case rather than a degenerate one.
const ICE_BOOKINGS = [
  {
    id: 'bk-ice-car',
    type: 'car',
    title: 'השכרת רכב · Blue Car Rental',
    confirmationCode: 'BCR-2291',
    fromPlaceId: 'pl-ice-kef',
    toPlaceId: 'pl-ice-kef',
    source: 'manual',
  },
].map((b) => ({ ...b, tripId: ICE_TRIP.id, updatedBy: ME }));

const ICE_EVENTS = [
  // The hire is multi-day `transport`, so ADR-0054 renders it as an ambient backdrop and not as a
  // stop — which is why every day below still needs two real stops of its own to have a leg.
  {
    id: 'ev-ice-car',
    title: 'השכרת רכב · Blue Car Rental',
    icon: '🚗',
    category: 'transport',
    kind: 'hard',
    status: 'planned',
    date: date(ICE_DAY),
    endDate: date(iceDay(4)),
    startsAt: iceAt(0, '10:00'),
    endsAt: iceAt(4, '09:00'),
    bookingId: 'bk-ice-car',
    sortOrder: 0,
  },
  {
    id: 'ev-ice-bluelagoon',
    title: 'הלגונה הכחולה',
    icon: '♨️',
    category: 'activity',
    kind: 'soft',
    status: 'planned',
    date: date(ICE_DAY),
    startsAt: iceAt(0, '11:00'),
    endsAt: iceAt(0, '13:00'),
    placeId: 'pl-ice-bluelagoon',
    sortOrder: 1,
  },
  {
    id: 'ev-ice-reykjavik',
    title: 'רייקיאוויק · העיר',
    icon: '🏘️',
    category: 'sightseeing',
    kind: 'soft',
    status: 'planned',
    date: date(ICE_DAY),
    startsAt: iceAt(0, '16:00'),
    endsAt: iceAt(0, '18:00'),
    placeId: 'pl-ice-reykjavik',
    sortOrder: 2,
  },
  {
    id: 'ev-ice-coffee',
    title: 'קפה לפני הדרך',
    icon: '☕',
    category: 'food',
    kind: 'soft',
    status: 'planned',
    date: date(iceDay(1)),
    startsAt: iceAt(1, '08:30'),
    endsAt: iceAt(1, '09:30'),
    placeId: 'pl-ice-reykjavik',
    sortOrder: 0,
  },
  {
    id: 'ev-ice-vik',
    title: 'החוף השחור · ויק',
    icon: '🏖️',
    category: 'nature',
    kind: 'soft',
    status: 'planned',
    date: date(iceDay(1)),
    startsAt: iceAt(1, '14:00'),
    endsAt: iceAt(1, '16:00'),
    placeId: 'pl-ice-vik',
    sortOrder: 1,
  },
  {
    id: 'ev-ice-cliffs',
    title: 'תצפית בוקר · ויק',
    icon: '🌅',
    category: 'nature',
    kind: 'soft',
    status: 'planned',
    date: date(iceDay(2)),
    startsAt: iceAt(2, '09:00'),
    endsAt: iceAt(2, '10:00'),
    placeId: 'pl-ice-vik',
    sortOrder: 0,
  },
  {
    id: 'ev-ice-hofn',
    title: 'לובסטר בהופן',
    icon: '🦞',
    category: 'food',
    kind: 'soft',
    status: 'planned',
    date: date(iceDay(2)),
    startsAt: iceAt(2, '17:00'),
    endsAt: iceAt(2, '19:00'),
    placeId: 'pl-ice-hofn',
    sortOrder: 1,
  },
  {
    id: 'ev-ice-hofn-morning',
    title: 'בוקר בהופן',
    icon: '☕',
    category: 'food',
    kind: 'soft',
    status: 'planned',
    date: date(iceDay(3)),
    startsAt: iceAt(3, '08:00'),
    endsAt: iceAt(3, '09:00'),
    placeId: 'pl-ice-hofn',
    sortOrder: 0,
  },
  // The far end of the refused leg. Ten hours between the two rows because the drive really is
  // that long — the gate refuses it, the crow-flies chip states the distance, and nothing about
  // the day pretends to know the duration (ADR-0206 §D4, §D5).
  {
    id: 'ev-ice-return',
    title: 'חזרה לרייקיאוויק',
    icon: '🌙',
    category: 'other',
    kind: 'soft',
    status: 'planned',
    date: date(iceDay(3)),
    startsAt: iceAt(3, '19:00'),
    endsAt: iceAt(3, '20:00'),
    placeId: 'pl-ice-reykjavik',
    sortOrder: 1,
  },
].map((e) => ({ ...e, tripId: ICE_TRIP.id, source: 'manual', updatedBy: ME }));

// **The whole group, not just me.** The demo trip had one membership, so every group-shaped
// behaviour — "one of us" reaching everybody, an assignment coming FROM somebody, the roster's
// avatars — was untestable against the seed. The other four users already existed; only their
// memberships were missing. The road trip seats three of the five, which is what a hire holds.
const MEMBERSHIPS = [
  ...USERS.map((u) => ({ tripId: TRIP.id, userId: u.id, role: u.id === ME ? 'admin' : 'peer' })),
  ...[ME, 'u-noam', 'u-dana'].map((id) => ({
    tripId: ICE_TRIP.id,
    userId: id,
    role: id === ME ? 'admin' : 'peer',
  })),
];

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: { ...u, createdAt: CREATED_AT },
      update: u,
    });
  }
  for (const t of [TRIP, ICE_TRIP]) {
    await prisma.trip.upsert({
      where: { id: t.id },
      create: { ...t, createdAt: CREATED_AT },
      update: t,
    });
  }
  for (const m of MEMBERSHIPS) {
    await prisma.membership.upsert({
      where: { tripId_userId: { tripId: m.tripId, userId: m.userId } },
      create: m,
      update: { role: m.role },
    });
  }
  // Places first — bookings/events reference them by FK.
  for (const p of [...PLACES, ...ICE_PLACES]) {
    await prisma.place.upsert({
      where: { id: p.id },
      create: { ...p, createdAt: CREATED_AT },
      update: p,
    });
  }
  for (const b of [...BOOKINGS, ...ICE_BOOKINGS]) {
    await prisma.booking.upsert({
      where: { id: b.id },
      create: { ...b, createdAt: CREATED_AT },
      update: b,
    });
  }
  for (const e of [...EVENTS, ...ICE_EVENTS]) {
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
    `Seeded: ${USERS.length} users, 2 trips, ${MEMBERSHIPS.length} memberships, ` +
      `${PLACES.length + ICE_PLACES.length} places, ` +
      `${BOOKINGS.length + ICE_BOOKINGS.length} bookings, ` +
      `${EVENTS.length + ICE_EVENTS.length} events, ${TASKS.length} tasks, ` +
      `${MAYBE_ITEMS.length} maybe-items.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
