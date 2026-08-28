// **THE DAY PAINTS ONCE** (ADR-0206 §AT), measured in the live page.
//
// The day's journey rows and its total APPEAR when a travel estimate lands, so before the hold a
// day painted from the snapshot and then redrew when its own Dexie read came back — 8 rows and
// ⁦509px⁩, then ⁦174ms⁩ later 10 rows and ⁦671px⁩, on every open and every swipe. That is what the
// owner reported as the day view blinking, and it is invisible to the unit suite twice over:
// jsdom has no paint, and the two states are both correct renders of what the app knew at the
// time. So this is an e2e, and what it samples is the PAINT — `visibility` — beside the layout,
// because the hold deliberately leaves the layout alone.
//
// The assertion is the shape of the defect rather than a number: from the frame the day first
// becomes visible, nothing about it may change again. A spec that asserted "10 rows" would go
// green on a day that painted 10 rows twice.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const DAY = new Date().toISOString().slice(0, 10);

/** The host day's page, and never a peek's. A peek holds a whole day surface, so `.day-page`
 *  exists three times over — and `.day-peeks` renders BEFORE it, so `.day-page` on its own is
 *  tomorrow (`frontend/CLAUDE.md`). The child combinator under the un-previewed host is exact. */
const PAGE = '.day-swipe:not([data-preview]) > .day-page';

const place = (id: string, name: string, lat: number, lng: number) => ({
  id,
  tripId: TRIP_ID,
  name,
  lat,
  lng,
  ...stamps,
});
/** Three walkable Tokyo stops, so the day has two measurable holes. */
const places = [
  place('p-a', 'שער קמינרימון', 35.7108, 139.7967),
  place('p-b', 'מוזיאון אדו', 35.6963, 139.7966),
  place('p-c', 'קאבוקי-זה', 35.6695, 139.7647),
];

const event = (id: string, placeId: string | null, from: string, to: string) => ({
  id,
  tripId: TRIP_ID,
  date: DAY,
  title: id,
  icon: '📌',
  category: 'sightseeing',
  ...(placeId ? { placeId } : {}),
  kind: 'soft',
  status: 'planned',
  startsAt: `${DAY}T${from}:00.000Z`,
  endsAt: `${DAY}T${to}:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
});

const LEG = { durationSeconds: 40 * 60, distanceMeters: 3_400 };

async function mockRoutes(page: Page): Promise<void> {
  await page.route(
    (u) => u.pathname.endsWith(`/trips/${TRIP_ID}/routes`),
    async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      const body = request.postDataJSON() as { modes: string[]; stops: unknown[] };
      const legs = [];
      for (let i = 0; i + 1 < body.stops.length; i++) {
        legs.push({
          fromIndex: i,
          toIndex: i + 1,
          estimates: body.modes.map((mode) => ({ mode, ...LEG })),
          refusedModes: [],
          pendingModes: [],
        });
      }
      await route.fulfill({ json: { legs } });
    },
  );
}

/** Every frame in which the day's painted shape differs from the frame before it. `painted` is
 *  `visibility`, which is what the hold spends and what `getBoundingClientRect` cannot see. */
async function watchPaint(page: Page, selector: string): Promise<void> {
  await page.addInitScript((sel) => {
    const w = window as unknown as { __paint: { painted: boolean; rows: number; h: number }[] };
    w.__paint = [];
    let prev = '';
    const sample = () => {
      const el = document.querySelector(sel);
      if (el) {
        const frame = {
          painted: getComputedStyle(el).visibility === 'visible',
          rows: el.querySelectorAll('.day-list > *').length,
          h: Math.round(el.getBoundingClientRect().height),
        };
        const key = JSON.stringify(frame);
        if (key !== prev) {
          w.__paint.push(frame);
          prev = key;
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, selector);
}

const paintLog = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __paint: { painted: boolean; rows: number; h: number }[] }).__paint,
  );

test.describe('the day surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await watchPaint(page, PAGE);
    await mockRoutes(page);
    await bootIntoTrip(page, {
      events: [
        event('ev-a', 'p-a', '09:00', '10:00'),
        event('ev-b', 'p-b', '12:00', '13:00'),
        event('ev-c', 'p-c', '15:00', '16:00'),
        // A hole this app can never measure — the row nobody gave a place (§AT2).
        event('ev-d', null, '19:00', '20:00'),
      ],
      places,
      dates: { startDate: DAY, endDate: DAY },
    });
    await page.goto('/');
    await expect(page.locator('nav.nav')).toBeVisible();
    await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
    await expect(page.locator(PAGE)).toBeVisible();
  });

  // The reported case: the app is opened on a day it has seen before, which is every day after
  // the first visit to it. The estimates are in Dexie, so the ONLY thing between the snapshot's
  // paint and the finished day is a local read — and the day waits for it.
  test('paints once on a day this device has already measured', async ({ page }) => {
    // Warm the cache the way a real second visit does, then come back to it.
    await expect(page.locator(`${PAGE} .day-total`)).toBeVisible();
    await page.reload();
    await expect(page.locator(PAGE)).toBeVisible();
    await page.waitForTimeout(3000);

    const frames = await paintLog(page);
    const painted = frames.filter((f) => f.painted);
    console.log(`[paint] ${JSON.stringify(frames)}`);
    expect(painted.length).toBeGreaterThan(0);
    // **The whole assertion.** Every painted frame is the same day: one shape, from the first
    // frame the reader can see it. Before the hold this was two — the second ⁦162px⁩ taller.
    const shapes = new Set(painted.map((f) => `${f.rows}/${f.h}`));
    expect([...shapes]).toHaveLength(1);
    // …and it is the FINISHED shape, not an empty one held forever: the journeys are in it.
    expect(await page.locator(`${PAGE} .day-trv`).count()).toBe(2);
  });

  // §AT2: a hole with an end nobody placed is missing from the total for good, so the same
  // numbers make a smaller claim. The unit specs own the derivation; this one proves the wiring
  // — that the count reaches the line at all — which no unit test on either half can see.
  test('says its total is a floor when a hole could not be measured', async ({ page }) => {
    const total = page.locator(`${PAGE} .day-total`);
    await expect(total).toBeVisible();
    await expect(total).toHaveText(new RegExp(t.travel.dayTotalFloor('')));
  });
});
