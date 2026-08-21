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
  preferredCurrency: null,
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
  // The three fields below are required by `tripSnapshotSchema` (ADR-0166 §6, ADR-0173 §1,
  // tasks brief §5), so the absence of any of them fails the zod parse in `fetchSnapshot` and
  // the app never boots at all — which surfaces as every spec here timing out rather than as
  // a readable error. `e2e/` is outside `tsconfig.json`'s `include`, so nothing but a run
  // catches a missing field in this fixture. **This has now happened four times**:
  // `enrichments` wrote the warning, `documentAttachments` walked into it anyway,
  // `preferredCurrency` showed the warning was read too narrowly — it counts for a new
  // required field on any entity NESTED in the snapshot (`USER`, `TRIP`, `MEMBERSHIP` above),
  // not only on the snapshot itself — and `tasks` walked into it a second time, from a
  // session that had already updated all five unit fixtures and did not think of this one.
  //
  // **So the guard below is now load-bearing rather than a nicety**: it turns the timeout
  // into the sentence you are reading. Any new snapshot field belongs here in the same
  // commit that adds it, and the run that proves it is `pnpm --filter @waypoint/frontend e2e`
  // — the unit suite cannot see this file.
  enrichments: {},
  documentAttachments: [],
  tasks: [],
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
/** The live planet build `/me` states (ADR-0187 §1 amendment). **Any daily id will do here and
 *  that is the point** — every archive read in this suite is intercepted, so this only has to make
 *  the app ask for a `planet-<build>.pmtiles` URL at all. Without it the detail source falls back
 *  to the world archive and the specs test one layer where production reads two. */
export const E2E_LIVE_MAP_BUILD = '20260821';
/** And which vintage of the offline archives it is cutting (ADR-0186 §6 amendment). Nothing here
 *  downloads one, so this only has to be present and stable — a device with no stored archive has
 *  nothing to compare it against. */
export const E2E_MAP_ARCHIVE_VINTAGE = 'v7';
const ME = {
  user: USER,
  memberships: [MEMBERSHIP],
  map: { liveBuild: E2E_LIVE_MAP_BUILD, archiveVintage: E2E_MAP_ARCHIVE_VINTAGE },
};

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
 *  Any spec that measures layout or drives real input wants this.
 *
 *  **Pass the clock the spec pins.** The window is ±3 days around a day, and "live" means
 *  the app's `now` falls inside it — so a spec that pins `now` to an ABSOLUTE instant and
 *  takes the default window here is live only while the box clock happens to be within
 *  three days of that instant, and lands on the all-trips screen the morning it is not.
 *  `hero-in-transit` shipped green that way and went red four days later with every one of
 *  its assertions still correct. Derive both from the same number: `shortLiveTripDates(NOW)`. */
export function shortLiveTripDates(now: number = Date.now()): {
  startDate: string;
  endDate: string;
} {
  const day = 24 * 60 * 60 * 1000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const midnight = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`);
  return { startDate: iso(midnight - 3 * day), endDate: iso(midnight + 3 * day) };
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
    /** Trip tasks, so a point can carry the hero's fourth content block (ADR-0160 §U) and a
     *  host row its mark (ADR-0191 §2). */
    tasks?: unknown[];
    /** Trip documents, so the Index's documents rows exist to be measured. */
    documents?: unknown[];
    /** **The attachment links** (ADR-0173 §1), so a host row can carry the DOCUMENT mark and
     *  a read surface can list what it holds (ADR-0174). Present in the snapshot from the
     *  start; it needed an option the moment a row's glyph depended on it. */
    documentAttachments?: unknown[];
    /** What the world knows about these places, keyed by place id (ADR-0166 §6) — the
     *  server-owned read model the snapshot carries. A place with no key is the normal
     *  "we know nothing" state, so `{}` (the default) is every existing spec. */
    enrichments?: Record<string, unknown>;
    /**
     * **Pin the app's clock**, in ms — the e2e half of the rule the unit suite already
     * follows (`frontend/CLAUDE.md`: "a test whose fixtures carry fixed dates must set its
     * own `now`").
     *
     * Opt-in, and it earns itself: a spec whose fixtures are times "today" is really a spec
     * about a PHASE — passed, now, upcoming — and which phase the clock produces changes by
     * the hour. Two specs here silently depended on being run in the afternoon and went red
     * the moment the date rolled past midnight UTC, on code that had not changed.
     *
     * **Pinned twice, because the app's own hook is DEV-ONLY.** `waypoint:dev-now` is read at
     * module load by `lib/useClock.ts` behind `import.meta.env.DEV`, so under `E2E_PREVIEW=1`
     * — a production bundle — that branch is compiled out and the whole fixture silently
     * reads the wall clock. Thirteen specs failed that way and only there, which is exactly
     * the disagreement between the two servers that this mode exists to expose, except that
     * here it was the HARNESS that differed rather than the app. `page.clock.setFixedTime`
     * pins the platform's clock instead, so both legs agree and neither depends on a
     * debug hook surviving into a build.
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
    tasks: opts.tasks ?? SNAPSHOT.tasks,
    documents: opts.documents ?? SNAPSHOT.documents,
    documentAttachments: opts.documentAttachments ?? SNAPSHOT.documentAttachments,
    enrichments: opts.enrichments ?? SNAPSHOT.enrichments,
  };
  // **The realtime socket, answered by nothing** (ADR-0019's gateway; `lib/ws.ts` opens it).
  //
  // There is no backend here, so this connection has always failed — and the two servers fail it
  // DIFFERENTLY, which the `E2E_PREVIEW=1` leg is what surfaced. `vite preview` answers the
  // upgrade with the SPA fallback at **200**, so the handshake fails loudly enough to reach
  // `console.error` and `boot-cross-tabs`'s clean-console assertion; the dev server does not.
  // Neither outcome says anything about the app.
  //
  // Intercepted rather than tolerated in the one spec that noticed: a socket that opens and stays
  // quiet is what "no backend" should look like everywhere, and it keeps that assertion strict
  // enough to still catch a console error we actually caused. Not connected upstream — no
  // `connectToServer()` — so nothing reaches a real server.
  await page.routeWebSocket(/\/trips\/.*\/stream/, () => {});

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
  // The half that survives a production build (see `now` above). `setFixedTime` rather than
  // `install()`: it fixes what the clock READS and leaves timers alone, which is what the
  // localStorage hook does too — a spec here still needs its intervals to fire.
  if (opts.now) await page.clock.setFixedTime(opts.now);
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
