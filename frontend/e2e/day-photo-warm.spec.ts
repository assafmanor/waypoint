// **A DAY'S PHOTOGRAPH IS THERE THE MOMENT THE DAY IS** (owner, 2026-10-20: _"the image doesn't
// show instantaneously but takes time to load. Even after the image is already cached"_).
//
// An `<img>` paints in the task that inserts it only when the document already holds its picture —
// the HTTP cache is a frame or more too late — so `lib/image-warm.ts` holds every day's picture
// decoded before it is asked for. Proved in two halves, because **`page.route` disables the
// browser's memory cache** for the whole page (measured: a held, decoded picture makes a new
// `<img>` complete on insertion without routing and never with it), and `bootIntoTrip` needs
// routes. So:
//
//   1. the mechanism, on a page with no routes: a held picture is complete on insertion;
//   2. the app, booted as usual: every day's picture is fetched before its day is opened —
//      including days never visited, which is what "preload" asks for.
//
// Both modes, because the two day surfaces render one head off one derivation (ADR-0159 §1).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const NOW = todayAt('00:00');
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAYS = [0, 1, 2].map((n) => iso(NOW + n * DAY_MS));
/** One distinct picture per day, from the app's own `public/` so the run stays hermetic. */
const PICTURES = ['/pwa-192.png', '/og-cover.png', '/og-invite.png'];

const places = DAYS.map((_, i) => ({
  id: `p-${i}`,
  tripId: TRIP_ID,
  name: `Stop ${i}`,
  lat: 64 + i / 10,
  lng: -20,
  ...stamps,
}));

const events = DAYS.map((date, i) => ({
  id: `ev-${i}`,
  tripId: TRIP_ID,
  date,
  title: `ev-${i}`,
  icon: '📌',
  category: 'sightseeing',
  placeId: `p-${i}`,
  kind: 'soft',
  status: 'planned',
  startsAt: `${date}T04:00:00.000Z`,
  endsAt: `${date}T06:00:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
}));

const enrichments = Object.fromEntries(
  PICTURES.map((url, i) => [
    `p-${i}`,
    {
      image: {
        url,
        mimeType: 'image/png',
        width: 512,
        height: 512,
        sizeBytes: 40_000,
        source: 'commons',
        license: 'CC BY-SA 4.0',
        attribution: 'A. Photographer',
        fetchedAt: '2026-08-01T00:00:00.000Z',
        method: 'name_proximity',
        ref: 'Q38519',
        confidence: 1,
      },
    },
  ]),
);

const PAGE = '.day-swipe:not([data-preview]) > .day-page';

async function openDays(page: Page, mode: 'trip' | 'plan'): Promise<void> {
  await bootIntoTrip(page, {
    events,
    places,
    enrichments,
    now: NOW,
    dates: { startDate: DAYS[0], endDate: DAYS[2] },
  });
  // A real network takes time to answer; without it a local server can win the race by luck.
  await page.route(/\.png$/, async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.getByRole('button', { name: t.mode[mode], exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', mode);
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page.locator(`${PAGE} .wp-photoband img`)).toBeVisible();
}

async function pickDay(page: Page, date: string): Promise<void> {
  await page
    .locator('.wp-daystrip button')
    .filter({ has: page.locator('.n', { hasText: new RegExp(`^${date.slice(8)}$`) }) })
    .first()
    .click();
  await expect(page.locator(`${PAGE} .wp-photoband img`)).toHaveAttribute(
    'src',
    new RegExp(`${PICTURES[DAYS.indexOf(date)].replace('.', '\\.')}$`),
  );
}

test('a held, decoded picture is complete the moment an <img> asks for it', async ({ page }) => {
  await page.goto('/favicon.svg');
  const ready = await page.evaluate(async (url) => {
    const held = new Image();
    held.src = url;
    await held.decode();
    const img = new Image();
    img.src = url;
    return img.complete && img.naturalWidth > 0;
  }, PICTURES[1]);
  expect(ready).toBe(true);
});

for (const mode of ['trip', 'plan'] as const) {
  test(`every day's photograph is fetched before its day is opened, ${mode}`, async ({ page }) => {
    const fetched = new Set<string>();
    page.on('request', (req) => fetched.add(new URL(req.url()).pathname));
    await openDays(page, mode);
    for (const date of [DAYS[1], DAYS[2]]) {
      const picture = PICTURES[DAYS.indexOf(date)];
      await expect.poll(() => fetched.has(picture), { message: picture }).toBe(true);
      await pickDay(page, date);
    }
  });
}
