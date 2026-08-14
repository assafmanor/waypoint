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

test('a ground that cannot be read is REPORTED, not left blank', async ({ page }) => {
  await openMap(page);

  // The archive request is answered with the SPA's own HTML — exactly what a misrouted or
  // unbuilt archive does in production, and what the owner's phone got.

  // **All three affordances, which is the whole point.** Before the fix the pane latched
  // `tilesPainted` off `load` + `idle` — both of which settle on a map whose every tile failed —
  // so a blank canvas carried no cue, no retry and no diagnostic at all.
  await expect(page.locator('.map-loading')).toContainText('הטעינה איטית מהרגיל');
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
  for (const pattern of ['**/map/world.pmtiles', '**/map/extract.pmtiles']) {
    await page.route(pattern, async (route) => {
      const upstream = await route.fetch({ url: PLANET });
      await route.fulfill({ response: upstream });
    });
  }

  await openMap(page);

  // **The app's own first-paint signal is the assertion.** Since 2026-08-14 it fires only when a
  // TILE of our ground has loaded and parsed, so the cue clearing is not "the renderer settled" —
  // it is "the ground is on screen". Generous, because this is a real network read of a 128 GiB
  // archive from another continent.
  await expect(page.locator('.map-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText('פרטים')).toHaveCount(0);

  // Kept as evidence rather than as an assertion about pixels: a human reads this once, and it is
  // the only artefact in the suite that shows the terrain at all.
  const shot = testInfo.outputPath('map.png');
  await page.locator('.map-pane').screenshot({ path: shot });
  await testInfo.attach('map.png', { path: shot, contentType: 'image/png' });
});
