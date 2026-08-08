// Hermetic boot for the nav e2e: route-mock the handful of endpoints the app
// hits on start so it lands in a live trip's Home with no backend/DB. The trip's
// date range is deliberately huge so `resolveLanding` treats it as "now"
// whatever the box clock reads (lib/active-trip.ts).
import type { Page } from '@playwright/test';
import { tripSnapshotSchema } from '@waypoint/shared';

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
  notes: [],
  // The two fields below are required by `tripSnapshotSchema` (ADR-0166 §6, ADR-0173 §1),
  // so the absence of either fails the zod parse in `fetchSnapshot` and the app never boots
  // at all — which surfaces as every spec here timing out rather than as a readable error.
  // `e2e/` is outside `tsconfig.json`'s `include`, so nothing but a run catches a missing
  // field in this fixture. **This has now happened twice**: `enrichments` wrote the warning,
  // `documentAttachments` walked into it anyway. Any new required snapshot field belongs
  // here in the same commit that adds it.
  enrichments: {},
  documentAttachments: [],
  latestSeq: '0',
};

// **Fail loudly HERE rather than as 25 timing-out specs.** The app parses the snapshot with
// this same schema on boot, so a fixture missing a required field simply never boots — and
// what a run then shows is every spec waiting for a screen that will not arrive, with
// nothing naming the cause. Parsing the fixture at import turns that into one readable
// error naming the missing field, the moment the file loads.
const invalid = tripSnapshotSchema.safeParse(SNAPSHOT);
if (!invalid.success) {
  throw new Error(
    `e2e snapshot fixture does not satisfy tripSnapshotSchema: ${invalid.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ')}`,
  );
}
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
    /** Trip notes, so a host row can carry the mark (ADR-0152 §6c). */
    notes?: unknown[];
    /** Trip documents, so the Index's documents rows exist to be measured. */
    documents?: unknown[];
    /** What the world knows about these places, keyed by place id (ADR-0166 §6) — the
     *  server-owned read model the snapshot carries. A place with no key is the normal
     *  "we know nothing" state, so `{}` (the default) is every existing spec. */
    enrichments?: Record<string, unknown>;
    /**
     * **Pin the app's clock**, in ms — the e2e half of the rule the unit suite already
     * follows (`frontend/CLAUDE.md`: "a test whose fixtures carry fixed dates must set its
     * own `now`"). The app reads `waypoint:dev-now` from localStorage at module load in DEV,
     * so seeding it before the first script runs fixes what "now" means for the whole page.
     *
     * Opt-in, and it earns itself: a spec whose fixtures are times "today" is really a spec
     * about a PHASE — passed, now, upcoming — and which phase the clock produces changes by
     * the hour. Two specs here silently depended on being run in the afternoon and went red
     * the moment the date rolled past midnight UTC, on code that had not changed.
     */
    now?: number;
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
    notes: opts.notes ?? SNAPSHOT.notes,
    documents: opts.documents ?? SNAPSHOT.documents,
    enrichments: opts.enrichments ?? SNAPSHOT.enrichments,
  };
  await page.route(
    (u) => u.pathname.endsWith('/auth/refresh'),
    (r) => r.fulfill({ json: { accessToken: 'test-token' } }),
  );
  await page.route(
    (u) => u.pathname === '/me',
    (r) => r.fulfill({ json: ME }),
  );
  // `/trips` is both an API path AND an app route, so this mock must answer only the
  // XHR. Left un-guarded it also fulfilled the DOCUMENT navigation, and `goto('/trips')`
  // rendered raw JSON instead of the all-trips screen — a spec that needs to COLD-LAUNCH
  // there (the back-parity one) could not.
  await page.route(
    (u) => u.pathname === '/trips',
    (r) => (r.request().resourceType() === 'document' ? r.continue() : r.fulfill({ json: [trip] })),
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
  // Event CREATES are answered for the same reason edits are (see above): without this the
  // POST 404s against the dev server, the app correctly rolls itself back, and a spec asserting
  // what a write PRODUCED would silently be asserting the rollback instead. Echoes the sent
  // input, which is the contract's shape — the client reconciles against it.
  await page.route(
    (u) => u.pathname === '/trips/t1/events',
    async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      const now = new Date().toISOString();
      await route.fulfill({
        status: 201,
        json: {
          tripId: 't1',
          status: 'planned',
          source: 'manual',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
          updatedBy: 'u1',
          ...(request.postDataJSON() ?? {}),
        },
      });
    },
  );
  // A shelf idea's own writes: consume (a schedule), restore (its undo), delete (un-parking) and
  // PATCH (re-aiming it at a day, ADR-0116 §2). Answered as a group because one verb can take
  // several — `החלף` consumes the idea it slots and its undo both restores that one and deletes
  // the idea the displaced event became.
  //
  // The PATCH echoes the seeded item merged with the patch, for the same reason the event one
  // above does: without it the write 404s, the app correctly rolls itself back, and a spec
  // asserting what the write PRODUCED is really asserting the rollback. That is exactly what the
  // first run of `fits-a-day.spec.ts` was doing.
  const seededIdeas = (opts.maybeItems ?? SNAPSHOT.maybeItems) as { id: string }[];
  await page.route(
    (u) => /^\/trips\/t1\/maybe-items\/[^/]+(\/(consume|restore))?$/.test(u.pathname),
    async (route, request) => {
      const method = request.method();
      if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
      if (method === 'PATCH') {
        const id = new URL(request.url()).pathname.split('/').pop();
        const before = seededIdeas.find((m) => m.id === id) ?? { id };
        return route.fulfill({
          json: {
            ...before,
            ...(request.postDataJSON() ?? {}),
            updatedAt: new Date().toISOString(),
          },
        });
      }
      if (method !== 'POST') return route.fallback();
      await route.fulfill({ status: 204, body: '' });
    },
  );
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
    ([me, tripId, now]) => {
      localStorage.setItem('wp_me', me as string);
      localStorage.setItem('wp_active_trip_id', tripId as string);
      // `waypoint:dev-now` — `lib/useClock.ts` reads it at module load, so it has to be set
      // before the app's first script, which is exactly what `addInitScript` guarantees.
      if (now) localStorage.setItem('waypoint:dev-now', now as string);
    },
    [JSON.stringify(ME), 't1', opts.now ? String(opts.now) : ''],
  );
}

/** A fixed hour on the CURRENT day, for a spec whose fixtures are times "today".
 *  Afternoon on purpose: it puts a morning fixture in the past and an evening one ahead,
 *  which is the pair most of these specs are actually about. */
export function todayAt(hhmm: string): number {
  return Date.parse(`${new Date().toISOString().slice(0, 10)}T${hhmm}:00.000Z`);
}

/** The auth half of `bootIntoTrip`, on its own — the two first-run surfaces need a signed-in
 *  user but NOT a trip, and duplicating these two routes in each spec is how the harness
 *  starts to rot (rule 8). */
async function mockAuth(page: Page, memberships: unknown[] = []): Promise<void> {
  await page.route(
    (u) => u.pathname.endsWith('/auth/refresh'),
    (r) => r.fulfill({ json: { accessToken: 'test-token' } }),
  );
  await page.route(
    (u) => u.pathname === '/me',
    (r) => r.fulfill({ json: { user: USER, memberships } }),
  );
  await page.route(
    (u) => u.pathname === '/trips',
    (r) =>
      r.request().resourceType() === 'document' || r.request().method() === 'POST'
        ? r.continue()
        : r.fulfill({ json: [] }),
  );
}

/** The trip a creation run produces. Dates fixed so the board's flapped row is assertable. */
export const CREATED_TRIP = {
  ...TRIP,
  name: 'יפן · ספטמבר',
  destination: 'יפן',
  startDate: '2026-09-12',
  endDate: '2026-09-23',
  icon: '🇯🇵',
};

/** The destination-picker fixture (session 191).
 *
 *  The picker is the one creation field behind a search sheet, which is why the birth
 *  sequence's e2e beat test shipped skipped. Both halves are OUR OWN backend relays
 *  (`/destinations/search` and `/destinations/resolve`, ADR-0113 §4) rather than Google
 *  directly, so mocking them is exact and needs no key — the same trade the Map specs
 *  make for the trip-scoped search.
 *
 *  Note there is a second, genuinely Google-free path in the product: `pp-name-only`
 *  ("use as typed"). A spec could drive that and stay hermetic with no fixture at all —
 *  but it exercises the branch that leaves the structured fields EMPTY, so it would not
 *  prove the picker's normal path works. Both are worth having; this mocks the normal one.
 */
export const DESTINATION_PREDICTION = {
  googlePlaceId: 'ChIJ-japan',
  primaryText: 'יפן',
  secondaryText: 'Japan',
};
const DESTINATION_RESOLVED = {
  googlePlaceId: 'ChIJ-japan',
  name: 'יפן',
  countryCode: 'JP',
  lat: 36.2,
  lng: 138.25,
  timezone: 'Asia/Tokyo',
};

async function mockDestinationPicker(page: Page): Promise<void> {
  await page.route(
    (u) => u.pathname === '/destinations/search',
    (r) => r.fulfill({ json: [DESTINATION_PREDICTION] }),
  );
  await page.route(
    (u) => u.pathname === '/destinations/resolve',
    (r) => r.fulfill({ json: DESTINATION_RESOLVED }),
  );
}

/** Land on `/new`, signed in with no trips, with the destination picker, `POST /trips`
 *  and the invite all ready. Covers ADR-0142's birth sequence — the one thing jsdom
 *  cannot see, since it loads no CSS and reports every rect as zero. */
export async function bootIntoCreate(page: Page): Promise<void> {
  await mockAuth(page);
  await mockDestinationPicker(page);
  await page.route(
    (u) => u.pathname === '/trips',
    (r) =>
      r.request().method() === 'POST'
        ? r.fulfill({ json: CREATED_TRIP })
        : r.request().resourceType() === 'document'
          ? r.continue()
          : r.fulfill({ json: [] }),
  );
  await page.route(
    (u) => u.pathname === `/trips/${CREATED_TRIP.id}/invite`,
    (r) => r.fulfill({ json: { inviteUrl: '/join/7Kq2mB' } }),
  );
  await page.goto('/new');
}

/** The all-trips list, with one trip of each shape the handoff has to work from: a live
 *  trip (the indigo hero, a 52px tile) and an upcoming one (a paper row, 46px). Both carry
 *  an explicit icon, since the glyph is the object that travels (ADR-0140 §7).
 *
 *  The live trip takes SHORT dates deliberately — the default 15-year range renders a day
 *  strip of thousands of buttons, and this spec lands inside the trip. */
export function twoTrips(): Record<string, unknown>[] {
  const day = 24 * 60 * 60 * 1000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return [
    { ...TRIP, ...shortLiveTripDates(), icon: '🗼' },
    {
      ...TRIP,
      id: 't2',
      name: 'ליסבון',
      destination: 'Lisboa',
      icon: '🛥️',
      startDate: iso(today + 30 * day),
      endDate: iso(today + 40 * day),
    },
  ];
}

/** Land on `/trips` with both list shapes rendered, and both trips openable. */
export async function bootIntoAllTrips(page: Page): Promise<void> {
  const trips = twoTrips();
  await mockAuth(page, [MEMBERSHIP]);
  await page.route(
    (u) => u.pathname === '/trips',
    (r) => (r.request().resourceType() === 'document' ? r.continue() : r.fulfill({ json: trips })),
  );
  for (const trip of trips) {
    const id = trip.id as string;
    await page.route(
      (u) => u.pathname === `/trips/${id}/snapshot`,
      (r) => r.fulfill({ json: { ...SNAPSHOT, trip } }),
    );
    await page.route(
      (u) => u.pathname === `/trips/${id}/changes`,
      (r) => r.fulfill({ json: [] }),
    );
  }
  await page.addInitScript(
    (me) => localStorage.setItem('wp_me', me as string),
    JSON.stringify({ user: USER, memberships: [MEMBERSHIP] }),
  );
  await page.goto('/trips');
}

/** The public invite preview a `/join/:code` visit reads. */
export const INVITE_PREVIEW = {
  tripId: 't1',
  tripName: 'יפן · ספטמבר',
  destination: 'יפן',
  startDate: '2026-09-12',
  endDate: '2026-09-23',
  memberCount: 4,
  icon: '🇯🇵',
};

/** Land on `/join/:code`. `expired` drives ADR-0143 §5's refused pass. */
export async function bootIntoJoin(
  page: Page,
  opts: { code?: string; expired?: boolean } = {},
): Promise<void> {
  const code = opts.code ?? '7Kq2mB';
  await mockAuth(page);
  await page.route(
    (u) => u.pathname === `/invites/${code}`,
    (r) =>
      opts.expired
        ? r.fulfill({ status: 410, json: { message: 'INVITE_EXPIRED', error: 'Gone' } })
        : r.fulfill({ json: INVITE_PREVIEW }),
  );
  await page.route(
    (u) => u.pathname === `/trips/join/${code}`,
    (r) => r.fulfill({ json: { ...MEMBERSHIP, tripId: 't1' } }),
  );
  await page.goto(`/join/${code}`);
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

/** Two overlapping SOFT events on today, which is what makes Plan mode's day render a
 *  CLUSTER with the `הזז` resolve affordance — and, with two movers to choose between,
 *  the resolve sheet's two-step shape (pick a mover, then a slot) whose in-sheet back
 *  button is the parity case (`e2e/back-parity.spec.ts`). Soft on purpose: a hard event
 *  is an anchor and never a mover (ADR-0011). */
export function overlappingSoftEvents() {
  const date = new Date().toISOString().slice(0, 10);
  const at = (hhmm: string) => `${date}T${hhmm}:00.000Z`;
  const base = {
    tripId: 't1',
    date,
    kind: 'soft',
    status: 'planned',
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
  return [
    {
      ...base,
      id: 'ev-a',
      title: 'מוזיאון',
      startsAt: at('10:00'),
      endsAt: at('12:00'),
      sortOrder: 0,
    },
    { ...base, id: 'ev-b', title: 'שוק', startsAt: at('11:00'), endsAt: at('13:00'), sortOrder: 1 },
  ];
}

/** A couple of trip places with coordinates, so the Map tab lists selectable rows without
 *  Google — the fixture the selection back-parity case needs (`back-implicit-dismiss.spec.ts`).
 *  Each is referenced by an event so it lands in the day-scoped list. */
export function tripPlaces() {
  return [
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
  ];
}
