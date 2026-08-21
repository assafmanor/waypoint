// Browser-contract e2e for **stepping the day with a swipe** (ADR-0200).
//
// The unit suite already owns the recogniser's arithmetic (`lib/useSwipePager.test.tsx`).
// What only a real engine can answer is the part the gesture is actually made of:
//
//   • **Whether the browser lets us have the horizontal axis at all.** There is deliberately
//     no `touch-action` on the host (it intersects down the chain and would take the maybe
//     shelf's own scroll away — ADR-0182's device-pass scar), so the arbitration is the
//     browser's heuristic against our `AXIS_RATIO`. jsdom has no such heuristic: it delivers
//     every synthetic pointer event unconditionally, so a unit test cannot fail this.
//   • **That a swipe over a strip scrolls the STRIP.** `scrollerWithin` asks "does it overflow
//     right now", which is a layout question — every rect is zero in jsdom, so the unit test
//     has to fake the overflow it is checking for.
//   • **Both day surfaces, in both modes.** They are two screens sharing one hook, and
//     `frontend/CLAUDE.md` records twice that a day-surface change verified on one of them
//     shipped broken on the other.
//
// Driven through CDP touch for the reason `e2e/touch.ts` states: `page.touchscreen` can only
// tap, and this whole file is about the travel in between — and an untrusted pointer event
// dispatched from `page.evaluate` has no active pointer behind it, so `setPointerCapture`
// throws on it and the gesture never starts.
import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';
import { dispatchTouch } from './touch';
import { SWIPE_PAGER } from '../src/constants';
import { t } from '../src/i18n/he';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const DAY = 86_400_000;
const NOW = todayAt('10:00');
const RANGE = shortLiveTripDates(NOW);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const TODAY = iso(NOW);
const TOMORROW = iso(NOW + DAY);
const YESTERDAY = iso(NOW - DAY);

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A tall-enough day, so the vertical case below has something to scroll and the swipe has
 *  a surface to land on well away from any edge. Trip timezone is UTC. */
const EVENTS = Array.from({ length: 8 }, (_, i) => ({
  id: `ev-${i}`,
  tripId: 't1',
  date: TODAY,
  title: `יעד ${i}`,
  kind: 'soft',
  status: 'planned',
  sortOrder: i,
  source: 'manual',
  startsAt: `${TODAY}T${String(11 + i).padStart(2, '0')}:00:00.000Z`,
  endsAt: `${TODAY}T${String(11 + i).padStart(2, '0')}:40:00.000Z`,
  ...stamps,
}));

/** Enough ideas that the shelf really overflows its strip — the whole point of the strip
 *  case is that `scrollsOn` answers yes about a box the browser actually laid out. */
const IDEAS = Array.from({ length: 10 }, (_, i) => ({
  id: `mb-${i}`,
  tripId: 't1',
  title: `רעיון ארוך למדי ${i}`,
  icon: '📍',
  consumed: false,
  createdBy: 'u1',
  ...stamps,
}));

const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
  dispatchTouch(cdp, type, [{ x, y }]);

/** The `?day=` on screen. Omitted entirely when the day IS today (`daySelectTarget`), so the
 *  absence is a value and not a missing assertion. */
const dayParam = (page: Page) => new URL(page.url()).searchParams.get('day');

async function boot(page: Page, mode: 'trip' | 'plan') {
  await bootIntoTrip(page, { events: EVENTS, maybeItems: IDEAS, now: NOW, dates: RANGE });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  if (mode === 'plan') {
    await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
    await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  }
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page.locator('.day-swipe')).toBeVisible({ timeout: 20_000 });
}

/**
 * One swipe across the day surface, in steps so the browser sees a real gesture rather than a
 * teleport. `dx` is signed in screen px: positive is rightward, which in this RTL app is the
 * NEXT day.
 *
 * `holdAtEnd` stops before lifting, which is the only way to observe the follow — after the
 * release the surface is already on its way back to level.
 */
async function swipeDay(
  page: Page,
  cdp: CDPSession,
  dx: number,
  { dy = 0, holdAtEnd = false }: { dy?: number; holdAtEnd?: boolean } = {},
) {
  // **The origin is the day's heading row, not a share of the surface's height.** A share
  // lands wherever the day happens to be tall — on a loaded day that is the maybe shelf,
  // which owns the horizontal axis and correctly refuses the gesture, so the spec would be
  // measuring the wrong thing while looking green on one fixture. The heading is the first
  // row of both day surfaces and exists on an empty day too, which the last-day case needs.
  const box = await page.locator('.day-swipe .sec-title').first().boundingBox();
  if (!box) throw new Error('no day heading to swipe from');
  const x0 = box.x + box.width * 0.45;
  const y0 = box.y + box.height / 2;
  await touch(cdp, 'touchStart', x0, y0);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', x0 + (dx * i) / steps, y0 + (dy * i) / steps);
  }
  if (holdAtEnd) return { x: x0 + dx, y: y0 + dy };
  await touch(cdp, 'touchEnd');
  return { x: x0 + dx, y: y0 + dy };
}

/** Comfortably past `COMMIT_SHARE` of the 390px column (the surface is narrower than the
 *  viewport by the body's padding, so this over-shoots on purpose rather than measuring). */
const COMMIT_PX = Math.ceil(390 * SWIPE_PAGER.COMMIT_SHARE) + 40;

test.describe('a day surface steps day to day with a swipe', () => {
  test('rightward is the next day and leftward is the previous one (Trip mode)', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    expect(dayParam(page)).toBeNull(); // today

    await swipeDay(page, cdp, COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);

    await swipeDay(page, cdp, -COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBeNull();

    await swipeDay(page, cdp, -COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBe(YESTERDAY);
  });

  test('the Plan builder steps the same way — one hook, two surfaces', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'plan');
    expect(dayParam(page)).toBeNull();

    await swipeDay(page, cdp, COMMIT_PX);
    await expect.poll(() => dayParam(page)).toBe(TOMORROW);
  });

  // THE REBUFF, on the surface rather than in the state: at the trip's last day the swipe
  // still moves something, capped, and then comes back with the day unchanged. Asserting only
  // "the day did not change" would pass just as well for a dead surface.
  test('the last day refuses the next one by straining and settling back', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    await page.goto(`/?tab=days&day=${RANGE.endDate}`);
    await expect(page.locator('.day-swipe')).toBeVisible();

    await swipeDay(page, cdp, COMMIT_PX, { holdAtEnd: true });
    const surface = page.locator('.day-swipe');
    await expect(surface).toHaveAttribute('data-swiping', '');
    const strained = await surface.evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue('--swipe-dx')),
    );
    expect(strained).toBeGreaterThan(0);
    expect(strained).toBeLessThanOrEqual(SWIPE_PAGER.EDGE_MAX_PX);

    await touch(cdp, 'touchEnd');
    expect(dayParam(page)).toBe(RANGE.endDate);
    await expect(surface).not.toHaveAttribute('data-swiping', '');
  });

  // The arbitration the host declares no `touch-action` for. A vertical drag is the body's
  // scroll and must not also page the day.
  test('a vertical drag scrolls the day instead of stepping it', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');

    const before = await page.evaluate(() => document.querySelector('main.body')!.scrollTop);
    await swipeDay(page, cdp, 0, { dy: -260 });
    await expect
      .poll(() => page.evaluate(() => document.querySelector('main.body')!.scrollTop))
      .toBeGreaterThan(before);
    expect(dayParam(page)).toBeNull();
  });

  // And the strip keeps its own axis, which is what `scrollerWithin` is there for.
  test('a swipe across the maybe shelf scrolls the shelf, not the day', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await boot(page, 'trip');
    const shelf = page.locator('.shelf').first();
    await shelf.scrollIntoViewIfNeeded();
    await expect(shelf).toBeVisible();
    const box = await shelf.boundingBox();
    if (!box) throw new Error('no shelf');

    const x0 = box.x + box.width * 0.7;
    const y0 = box.y + box.height / 2;
    await touch(cdp, 'touchStart', x0, y0);
    for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', x0 - (140 * i) / 8, y0);
    await touch(cdp, 'touchEnd');

    expect(dayParam(page)).toBeNull();
    // Polled, not read once: the strip is `scroll-snap-type: x mandatory`, so a released
    // drag is still animating to its snap point for a frame or two. Reading immediately
    // caught a 0 under a loaded machine and said the shelf had not moved.
    await expect.poll(() => shelf.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
  });
});
