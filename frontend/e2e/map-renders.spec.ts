// **DOES THE GROUND ACTUALLY DRAW?** (ADR-0186 Phase 2, after 2026-08-14.)
//
// The spec that did not exist, and its absence is what let a blank map reach the owner's phone.
// Every other Map spec here asserts markup, geometry or wiring — all of which were perfectly
// healthy on the failing device: the pane rendered, the attribution rendered, the pins rendered,
// and the ground was nothing but its own background colour. Unit tests could not see it either,
// because jsdom has no GPU and the renderer was stubbed. So the gap was structural rather than an
// oversight in any one file: **nothing in the suite asked whether a tile ever arrived.**
//
// Two halves, and the first is the one that matters most:
//
//  1. **Hermetic, and it runs everywhere.** There is no backend here, so the archive request is
//     answered by the dev server's SPA fallback — HTML where PMTiles bytes should be, which is a
//     faithful copy of the deployed failure. The app must SAY so. This is the regression test for
//     the exact defect, and it needs no network.
//  2. **Against a real archive, opt-in.** Points the tile request at Protomaps' own planet build
//     over range requests — the same read ADR-0186's mockup used to prove the style — and asserts
//     the app's own first-paint signal clears. It is skipped unless `MAP_TILES_E2E=1`, because a
//     spec that reaches the public internet is a flake in CI and a false green when it is offline.
import { expect, test } from '@playwright/test';
import { MAP_LOAD_TIMEOUT_MS } from '../src/constants';
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';

const TRIP_ID = 't1';
const today = () => new Date().toISOString().slice(0, 10);
const stamps = { createdAt: '', updatedAt: '', updatedBy: 'u1' };

/** Bangkok, because the reported failure was a trip there and the archive's coverage of it is
 *  the thing in question. One place, so the camera opens at `MAP_ZOOM.PLACE` on it rather than
 *  fitting a spread — which is the zoom the blank map was blank AT. */
const places = [
  { id: 'pl-bkk', tripId: TRIP_ID, name: 'Wat Pho', lat: 13.7465, lng: 100.4927, ...stamps },
];

const events = [
  {
    id: 'ev-bkk',
    tripId: TRIP_ID,
    date: today(),
    title: 'stop 1',
    icon: '🍜',
    category: 'food',
    kind: 'soft',
    status: 'planned',
    placeId: 'pl-bkk',
    startsAt: `${today()}T05:00:00.000Z`,
    sortOrder: 0,
    source: 'manual',
    ...stamps,
  },
];

/** Protomaps' daily planet build, read by byte range. 127.88 GiB at the far end and a handful of
 *  requests at this one — which is the whole property PMTiles has and ADR-0186 §3 is built on. */
const PLANET = 'https://build.protomaps.com/20260813.pmtiles';

async function openMap(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootIntoTrip(page, {
    places,
    events,
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page.locator('.map-pane')).toBeVisible();
  // The near-me pre-prompt is the one floating object over the canvas on a first visit
  // (ADR-0126 §6), and it sits exactly where the failure chrome does. Dismissed the way a person
  // would, rather than clicked through with `force` — a `force` here would hide the real question
  // of whether the diagnostic is reachable.
  const notNow = page.getByRole('button', { name: 'לא עכשיו' });
  if (await notNow.isVisible()) await notNow.click();
}

// ── THE TILE READ CARRIES THE APP'S CREDENTIALS (2026-08-14, from the owner's diagnostic) ──
//
// `err:Error: Bad response code: 401`, `tiles:0`. The `pmtiles` protocol issues its own range
// requests from inside MapLibre, on a worker thread, so they never pass through `apiFetch` — and
// ADR-0020 puts a global `JwtAuthGuard` on every route that is not `@Public()`. Every read was
// refused, and **nothing in the repo could see it**: e2e has no backend and no guard, so an
// unauthenticated range read looks exactly like an authenticated one. So the header is the
// assertion, not the response.
test('every archive read carries the Bearer token', async ({ page }) => {
  const auth: (string | undefined)[] = [];
  await page.route('**/*.pmtiles', async (route) => {
    auth.push(route.request().headers()['authorization']);
    // Refused deliberately: what is under test is what we SENT, and a 401 here also exercises the
    // reporting path the test below asserts.
    await route.fulfill({ status: 401, body: 'nope' });
  });

  await openMap(page);
  await expect.poll(() => auth.length, { timeout: 15_000 }).toBeGreaterThan(0);
  // `test-token` is what `boot.ts`'s `/auth/refresh` hands the app.
  expect(auth.every((header) => header === 'Bearer test-token')).toBe(true);
});

// ── THE HEBREW GROUND READS RIGHT-TO-LEFT (2026-08-14, ADR-0186 amendment 269j) ──
//
// The first working map drew every RTL label reversed — `רופגניס` for `סינגפור`, `דנליאת` for
// `תאילנד` — because a GL renderer lays glyphs out in logical order and the bidi pass is a plugin.
//
// **Asserted as a NETWORK fact, and that is deliberate.** Whether the shaping is right is a pixel
// question this suite cannot answer; whether the plugin ARRIVED is an asset-path question, and the
// asset path is exactly what broke the tile worker one amendment ago. Both halves of that trap are
// covered here: it must come from our own origin (not the unpkg URL every example gives — §3 allows
// no vendor host on a user's fetch path, and Phase 3 has no network), and it must be JAVASCRIPT,
// because `spa-fallback.filter.ts` answers a missing asset with `index.html` at **200** and a
// worker fed HTML dies silently.
test('the RTL text plugin loads, from our origin, as JavaScript', async ({ page }) => {
  const plugin: { url: string; status: number; type: string }[] = [];
  page.on('response', (response) => {
    if (!/rtl-text/i.test(response.url())) return;
    plugin.push({
      url: response.url(),
      status: response.status(),
      type: response.headers()['content-type'] ?? '',
    });
  });

  await openMap(page);
  await expect.poll(() => plugin.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const [script] = plugin;
  expect(script!.status).toBe(200);
  expect(new URL(script!.url).origin).toBe(new URL(page.url()).origin);
  // The 200-with-HTML trap: a content type is what tells a real script from the app shell.
  expect(script!.type).toMatch(/javascript|ecmascript/i);
});

// ── THE LABELS' GLYPHS ARE SERVED, AS BYTES (ADR-0186 §3, Phase 3) ──
//
// A GL renderer fetches pre-rendered SDF glyphs per 256-codepoint range; that template pointed at
// `protomaps.github.io` until Phase 3, which §3 forbids and a plane makes useless. Vendored into
// `public/map-glyphs/` — and **whether a `public/` file is actually SERVED is a build-time fact**,
// which is the class this suite learned to distrust the hard way (amendment 269i).
//
// Asked over HTTP rather than through the map, deliberately: glyphs are only requested once a tile
// carrying a label has parsed, so routing this through a render would make it an opt-in test of the
// network instead of a hermetic test of the build. The failure it catches is the same 200-with-HTML
// trap as the worker's — a miss does not 404 loudly, it comes back looking like success.
test('the glyph ranges are served from our origin as bytes, not as the app shell', async ({
  request,
}) => {
  // Latin and Hebrew: the two the app cannot do without, one of them the UI's own script.
  for (const range of ['0-255', '1280-1535']) {
    const res = await request.get(
      `/map-glyphs/${encodeURIComponent('Noto Sans Regular')}/${range}.pbf`,
    );
    expect(res.status()).toBe(200);
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(1000);
    // `<` is `index.html`. A protobuf's first byte is a field tag, never that.
    expect(body[0]).not.toBe('<'.charCodeAt(0));
  }
});

test('a ground that cannot be read is REPORTED, not left blank', async ({ page }) => {
  await openMap(page);

  // The archive request is answered with the SPA's own HTML — exactly what a misrouted or
  // unbuilt archive does in production, and what the owner's phone got.

  // **All three affordances, which is the whole point.** Before the fix the pane latched
  // `tilesPainted` off `load` + `idle` — both of which settle on a map whose every tile failed —
  // so a blank canvas carried no cue, no retry and no diagnostic at all.
  await expect(page.locator('.map-loading')).toContainText('הטעינה איטית מהרגיל', {
    timeout: MAP_LOAD_TIMEOUT_MS.TILES + 5_000,
  });
  await expect(page.getByRole('button', { name: /נסו שוב/ })).toBeVisible();
  await expect(page.getByText('פרטים')).toBeVisible();

  // And the diagnostic reads the fact rather than a guess: nothing painted.
  await page.getByText('פרטים').click();
  await expect(page.locator('.map-diag-out')).toContainText('painted:n');
});

test('the ground draws from a real archive', async ({ page }, testInfo) => {
  test.skip(
    process.env.MAP_TILES_E2E !== '1',
    'reaches build.protomaps.com — run with MAP_TILES_E2E=1',
  );

  // The app asks its own origin; this hands that request to the planet build, range header and
  // all, so the response the page sees is same-origin and the protocol is exercised for real.
  // BOTH archives, because the style reads two whenever a trip has an extract (§4's underlay) —
  // pointing only the world at a real archive would leave the detail source dead and test the
  // wrong shape. The planet build stands in for both: a z0–15 archive is what a trip extract is a
  // slice of, so this is the layer stack the app actually ships.
  for (const pattern of ['**/map/world.pmtiles', '**/map/planet-*.pmtiles']) {
    await page.route(pattern, async (route) => {
      const upstream = await route.fetch({ url: PLANET });
      await route.fulfill({ response: upstream });
    });
  }

  // What the spec above cannot see: whether the RENDERER asks for the ranges we serve. The
  // fontstack is a directory name with spaces in it, MapLibre substitutes it unencoded, and a
  // miss does not fail — it falls back to TinySDF and draws the label in the system font with a
  // console warning nobody reads. So the request is the assertion.
  const glyphs: number[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/map-glyphs/')) glyphs.push(res.status());
  });

  await openMap(page);

  // **The app's own first-paint signal is the assertion.** Since 2026-08-14 it fires only when a
  // TILE of our ground has loaded and parsed, so the cue clearing is not "the renderer settled" —
  // it is "the ground is on screen". Generous, because this is a real network read of a 128 GiB
  // archive from another continent.
  await expect(page.locator('.map-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText('פרטים')).toHaveCount(0);

  await expect.poll(() => glyphs.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(glyphs.every((status) => status === 200)).toBe(true);

  // Kept as evidence rather than as an assertion about pixels: a human reads this once, and it is
  // the only artefact in the suite that shows the terrain at all.
  const shot = testInfo.outputPath('map.png');
  await page.locator('.map-pane').screenshot({ path: shot });
  await testInfo.attach('map.png', { path: shot, contentType: 'image/png' });
});
