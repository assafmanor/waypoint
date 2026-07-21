// Hermetic boot for the nav e2e: route-mock the handful of endpoints the app
// hits on start so it lands in a live trip's Home with no backend/DB. The trip's
// date range is deliberately huge so `resolveLanding` treats it as "now"
// whatever the box clock reads (lib/active-trip.ts).
import type { Page } from '@playwright/test';

const USER = {
  id: 'u1',
  email: 'assaf@example.com',
  displayName: 'Assaf',
  avatarColor: '#3b5bdb',
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

/** Register the boot route mocks + seed the two per-device localStorage keys, so
 *  a plain `page.goto('/')` cold-boots straight into the trip Home as the FIRST
 *  history entry (index 0) — exactly the case the Android back-guard exists for.
 *  Pass `bookings` to seed the trip snapshot (default: none). */
export async function bootIntoTrip(page: Page, opts: { bookings?: unknown[] } = {}): Promise<void> {
  const snapshot = { ...SNAPSHOT, bookings: opts.bookings ?? SNAPSHOT.bookings };
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
    (r) => r.fulfill({ json: [TRIP] }),
  );
  await page.route(
    (u) => u.pathname === '/trips/t1/snapshot',
    (r) => r.fulfill({ json: snapshot }),
  );
  await page.route(
    (u) => u.pathname === '/trips/t1/changes',
    (r) => r.fulfill({ json: [] }),
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
