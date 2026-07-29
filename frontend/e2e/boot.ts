// Hermetic boot for the nav e2e: route-mock the handful of endpoints the app
// hits on start so it lands in a live trip's Home with no backend/DB. The trip's
// date range is deliberately huge so `resolveLanding` treats it as "now"
// whatever the box clock reads (lib/active-trip.ts).
import type { Page } from '@playwright/test';

const USER = {
  id: 'u1',
  email: 'assaf@example.com',
  displayName: 'Assaf',
  avatarHue: 'denim',
  avatarChoice: 'initials',
  googleAvatarUrl: null,
  uploadedAvatarUrl: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};
const MEMBERSHIP = {
  id: 'm1',
  tripId: 't1',
  userId: 'u1',
  role: 'admin',
  calendarSyncEnabled: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};
const TRIP = {
  id: 't1',
  name: 'טוקיו',
  destination: 'Tokyo',
  startDate: '2020-01-01',
  endDate: '2035-12-31',
  timezone: 'UTC',
  createdBy: 'u1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const SNAPSHOT = {
  trip: TRIP,
  members: [MEMBERSHIP],
  users: [USER],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  latestSeq: '0',
};
const ME = { user: USER, memberships: [MEMBERSHIP] };

/** Two unlinked bookings of DIFFERENT types, so the Index bookings screen shows
 *  category filter chips (one per type with count > 0, ADR-0101) — the fixture
 *  the back-navigation category-filter repro (ADR-0103) needs. Unlinked (no
 *  event) is enough: the chips derive from `countByCategory`, not the timeline. */
export const TWO_TYPE_BOOKINGS = [
  {
    id: 'bk-flight',
    tripId: 't1',
    type: 'flight',
    title: 'Tokyo flight',
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 'bk-hotel',
    tripId: 't1',
    type: 'hotel',
    title: 'Shinjuku hotel',
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

/** A trip live "now" whatever the box clock reads, but only a week long — the
 *  default 15-year range makes the header's day strip render thousands of day
 *  buttons, and on that DOM Playwright's own locator queries start timing out.
 *  Any spec that measures layout or drives real input wants this. */
export function shortLiveTripDates(): { startDate: string; endDate: string } {
  const day = 24 * 60 * 60 * 1000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return { startDate: iso(today - 3 * day), endDate: iso(today + 3 * day) };
}

/** Register the boot route mocks + seed the two per-device localStorage keys, so
 *  a plain `page.goto('/')` cold-boots straight into the trip Home as the FIRST
 *  history entry (index 0) — exactly the case the Android back-guard exists for.
 *  Pass `bookings` to seed the trip snapshot (default: none). */
export async function bootIntoTrip(
  page: Page,
  opts: {
    bookings?: unknown[];
    events?: unknown[];
    maybeItems?: unknown[];
    /** Trip places, so the Map tab's FREE half has rows to choose from — an errand can
     *  then be finished without Google, which is what keeps this spec hermetic. */
    places?: unknown[];
    /** Override the trip's date range (see `shortLiveTripDates`). */
    dates?: { startDate: string; endDate: string };
  } = {},
): Promise<void> {
  const trip = { ...TRIP, ...opts.dates };
  const snapshot = {
    ...SNAPSHOT,
    trip,
    bookings: opts.bookings ?? SNAPSHOT.bookings,
    events: opts.events ?? SNAPSHOT.events,
    maybeItems: opts.maybeItems ?? SNAPSHOT.maybeItems,
    places: opts.places ?? SNAPSHOT.places,
  };
  await page.route(
    (u) => u.pathname.endsWith('/auth/refresh'),
    (r) => r.fulfill({ json: { accessToken: 'test-token' } }),
  );
  await page.route(
    (u) => u.pathname === '/me',
    (r) => r.fulfill({ json: ME }),
  );
  await page.route(
    (u) => u.pathname === '/trips',
    (r) => r.fulfill({ json: [trip] }),
  );
  await page.route(
    (u) => u.pathname === '/trips/t1/snapshot',
    (r) => r.fulfill({ json: snapshot }),
  );
  await page.route(
    (u) => u.pathname === '/trips/t1/changes',
    (r) => r.fulfill({ json: [] }),
  );
  // Event edits are answered, not just reads. Without this the optimistic update
  // lands, the real PATCH 404s against the dev server, and the app correctly rolls
  // itself back — so any test asserting what a write PRODUCED would be testing the
  // rollback. Echoes the seeded event merged with the patch, which is the contract's
  // shape (`applyUpdateEvent` reconciles against it).
  const seeded = (opts.events ?? SNAPSHOT.events) as { id: string }[];
  await page.route(
    (u) => /^\/trips\/t1\/events\/[^/]+$/.test(u.pathname),
    async (route, request) => {
      const method = request.method();
      if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
      if (method !== 'PATCH') return route.fallback();
      const id = new URL(request.url()).pathname.split('/').pop();
      const before = seeded.find((e) => e.id === id) ?? { id };
      await route.fulfill({
        json: { ...before, ...(request.postDataJSON() ?? {}), updatedAt: new Date().toISOString() },
      });
    },
  );
  // Shelf writes, so parking a row (create-idea then delete-event) survives to the
  // assertion instead of rolling back. Echoes what was sent.
  await page.route(
    (u) => u.pathname === '/trips/t1/maybe-items',
    async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      const now = new Date().toISOString();
      await route.fulfill({
        json: {
          tripId: 't1',
          consumed: false,
          createdBy: 'u1',
          createdAt: now,
          updatedAt: now,
          updatedBy: 'u1',
          ...(request.postDataJSON() ?? {}),
        },
      });
    },
  );
  // Seed the cached identity + active-trip id the app reads on boot, so auth
  // resolves as "authed" and the landing picks our trip without a race.
  await page.addInitScript(
    ([me, tripId]) => {
      localStorage.setItem('wp_me', me as string);
      localStorage.setItem('wp_active_trip_id', tripId as string);
    },
    [JSON.stringify(ME), 't1'],
  );
}

export const TRIP_ID = 't1';

/** One hotel booking with **no place**, plus a place the trip already owns and an event that
 *  references it — the fixture the booking place-errand round trip needs (ADR-0134 §2).
 *
 *  No place on the booking is what makes `＋ מיקום` appear on its detail; the referenced
 *  place is what gives the Map tab a row to CHOOSE, so the whole trip is finished without
 *  Google and the spec stays hermetic. */
export const ERRAND_FIXTURE = {
  bookings: [
    {
      id: 'bk-hotel',
      tripId: 't1',
      type: 'hotel',
      title: 'Shinjuku hotel',
      source: 'manual',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      updatedBy: 'u1',
    },
  ],
  places: [
    {
      id: 'pl-museum',
      tripId: 't1',
      name: 'Mori Museum',
      lat: 35.66,
      lng: 139.73,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      updatedBy: 'u1',
    },
  ],
  events: [
    {
      id: 'ev-museum',
      tripId: 't1',
      date: new Date().toISOString().slice(0, 10),
      title: 'Museum',
      kind: 'soft',
      status: 'planned',
      placeId: 'pl-museum',
      sortOrder: 0,
      source: 'manual',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      updatedBy: 'u1',
    },
  ],
};
