// **The in-transit hero, in a real browser** (ADR-0160's session-215 amendment).
//
// It has an e2e because the two things the reports were about are layout facts jsdom
// cannot see — every rect there is zero, which is exactly how a wrapping row and a rail
// 258px away from its subject shipped past a green unit suite. The unit tests assert the
// DOM invariants (one action row, the rail inside the point); these assert the geometry
// those invariants exist to produce.
//
// Both phone widths are driven, because the wrap this fixes failed DIFFERENTLY at each: at
// 390px the name and `במפה` shared line 1 and `ניווט` dropped alone; at 360px the name took
// line 1 and both chips dropped.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates } from './boot';

/** A flight in the air at the pinned clock, with a real airport name on the far end —
 *  the name is the point: a short one never wrapped and never would have. */
const NOW = Date.parse('2026-08-05T20:36:00.000Z');
const DAY = '2026-08-05';

const PLACES = [
  {
    id: 'p-fra',
    tripId: 't1',
    name: 'פרנקפורט (Frankfurter Flughafen – FRA)',
    lat: 50.037,
    lng: 8.562,
    timezone: 'Europe/Berlin',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 'p-tlv',
    tripId: 't1',
    name: 'נמל התעופה בן גוריון',
    lat: 32.009,
    lng: 34.882,
    timezone: 'Asia/Jerusalem',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

const BOOKINGS = [
  {
    id: 'bk-fl',
    tripId: 't1',
    type: 'flight',
    title: 'LH 692',
    confirmationCode: 'LH692',
    fromPlaceId: 'p-fra',
    toPlaceId: 'p-tlv',
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

const EVENTS = [
  {
    id: 'ev-fl',
    tripId: 't1',
    date: DAY,
    title: 'LH 692',
    icon: '✈️',
    category: 'transport',
    kind: 'hard',
    startsAt: '2026-08-05T16:00:00.000Z',
    endsAt: '2026-08-05T22:15:00.000Z',
    bookingId: 'bk-fl',
    status: 'planned',
    sortOrder: 1,
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 'ev-next',
    tripId: 't1',
    date: DAY,
    title: 'איוש',
    icon: '💡',
    kind: 'soft',
    startsAt: '2026-08-06T04:00:00.000Z',
    endsAt: '2026-08-06T05:00:00.000Z',
    status: 'planned',
    sortOrder: 2,
    source: 'manual',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

async function liftedHero(page: Page) {
  await bootIntoTrip(page, {
    now: NOW,
    dates: shortLiveTripDates(),
    events: EVENTS,
    bookings: BOOKINGS,
    places: PLACES,
  });
  await page.goto('/');
  const board = page.locator('.wp-board').first();
  await expect(board).toBeVisible();
  await board.click();
  const hero = page.locator('.hero-lifted');
  await expect(hero).toBeVisible();
  // **Wait for the flight to land before measuring.** The lift is a FLIP, so between
  // "visible" and "settled" the hero is mid-animation and its scroller is transiently
  // taller than its box — which is a real measurement of a state nobody looks at. Poll for a
  // stable height rather than sleeping a literal: the duration is a token and reduced motion
  // makes it zero (ADR-0140), so a constant here would be wrong in two directions.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.hero-lifted') as HTMLElement | null;
      if (!el) return false;
      const h = Math.round(el.getBoundingClientRect().height);
      const prev = Number(el.dataset.e2eLastHeight ?? '-1');
      el.dataset.e2eLastHeight = String(h);
      return h > 0 && h === prev;
    },
    undefined,
    { polling: 100 },
  );
  return hero;
}

/** How many LINE BOXES a flex row's children occupy. Deliberately not "distinct `top`
 *  values", which was this check's first version and is wrong: a 15px name beside a 34px
 *  chip has a different top on the SAME line, so it reported three lines where there were
 *  two. Items on one flex line share a line box, so cluster by vertical centre. */
async function lineCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const row = document.querySelector(sel)!;
    const rects = [...row.children]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .sort((a, b) => a.top - b.top);
    const bands: { top: number; bottom: number }[] = [];
    for (const r of rects) {
      const mid = r.top + r.height / 2;
      const band = bands.find((b) => mid >= b.top - 1 && mid <= b.bottom + 1);
      if (band) {
        band.top = Math.min(band.top, r.top);
        band.bottom = Math.max(band.bottom, r.bottom);
      } else bands.push({ top: r.top, bottom: r.bottom });
    }
    return bands.length;
  }, selector);
}

for (const width of [360, 390]) {
  test(`the ways out of a point hold ONE line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 844 });
    const hero = await liftedHero(page);
    await expect(hero.locator('.hero-acts')).toHaveCount(1);
    // The report: `ניווט` on a line of its own, `להזמנה` on a third.
    expect(await lineCount(page, '.hero-lifted .hero-acts')).toBe(1);
    // The name is a sibling of that row and ellipsizes instead of pushing a chip off it,
    // which is the whole reason it left the row.
    const clipped = await page.evaluate(() => {
      const nm = document.querySelector('.hero-lifted .hero-where-nm')!;
      return { scroll: nm.scrollWidth, client: nm.clientWidth };
    });
    expect(clipped.client).toBeLessThanOrEqual(clipped.scroll);
  });
}

test('the journey rail sits with the flight, not under the next event', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const hero = await liftedHero(page);
  const gap = await page.evaluate(() => {
    const route = document.querySelector('.hero-lifted .wp-board-now-title')!;
    const rail = document.querySelector('.hero-lifted .wp-board-transit-prog')!;
    const next = document.querySelector('.hero-lifted .wp-board-next-row')!;
    return {
      belowRoute: Math.round(
        rail.getBoundingClientRect().top - route.getBoundingClientRect().bottom,
      ),
      aboveNext: Math.round(next.getBoundingClientRect().top - rail.getBoundingClientRect().bottom),
    };
  });
  // Close under the route it describes, and ABOVE `הבא בתור` rather than below it — the
  // ordering that made it read as the next event's progress bar.
  expect(gap.belowRoute).toBeGreaterThan(0);
  expect(gap.belowRoute).toBeLessThan(80);
  expect(gap.aboveNext).toBeGreaterThan(0);
  // Nothing is pinned in transit at all.
  await expect(hero.locator('.hero-foot')).toHaveCount(0);
});

test('the hero fits the phone without becoming a scroller', async ({ page }) => {
  // ADR-0160 §8 chose a content-sized hero; the point of measuring is that the depth this
  // session added does not turn it into a screen.
  await page.setViewportSize({ width: 390, height: 844 });
  const hero = await liftedHero(page);
  const fits = await page.evaluate(() => {
    const scroll = document.querySelector('.hero-lifted .hero-scroll')!;
    return { overflowing: scroll.scrollHeight > scroll.clientHeight + 1 };
  });
  expect(fits.overflowing).toBe(false);
  await expect(hero).toBeVisible();
});
