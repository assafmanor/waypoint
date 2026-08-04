// **A DATELESS IDEA NAMES THE DAY IT BELONGS TO, AND AGREEING GOES THERE**
// (ADR-0151's 2026-08-04 amendment — its second strategy).
//
// `near-the-day` ranks the pool against the day you are looking at, so an idea says
// `200 מ׳ מהמוזיאון` on the day it is near and `נוסף לאחרונה` on every other day. At thirty
// researched places, discovering that eight of them cluster around Thursday's plan meant
// visiting each day and reading the shelf again. `fits-a-day` says which day instead.
//
// **The second half is why this spec exists at all**, and it came from asking where the idea
// goes (owner: _"when you mark a maybe for a specific day, does it move to `ליום הזה` that
// already exists?"_). Yes — but that group belongs to the day ON SCREEN, and this strategy
// exists precisely to talk about the days you are not on. So accepting a proposal for day 4
// from day 1 used to leave the idea in the pool, demoted below every dateless idea
// (`TIER.AIMED_ELSEWHERE`) and possibly out of the strip altogether, with its reason flipped
// from the spatial fact that justified the suggestion to "aimed at another day".
//
// That whole chain crosses the ranking, the shelf's grouping, a verb and the focused day — so
// it is only true end to end, on a real screen, which is what this file checks.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, todayAt, TRIP_ID } from './boot';
// The group headers carry niqqud (`לְיום הזה`), so the copy comes from the app rather than from a
// literal retyped here — which is how the first draft of this spec looked for a string that did
// not exist.
import { t } from '../src/i18n/he';

const PHONE = { width: 390, height: 844 };
const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A fixed span so "day 1" and "day 4" mean the same thing on every run. Day 1 is today, so
 *  the trip is live and the shelf renders in Trip mode. */
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const DAY_1 = iso(0);
const DAY_4 = iso(3);

/** Day 4's only stop, and an idea 300m from it. Day 1 has a stop of its own, far away, so the
 *  idea is not near the day being viewed — which is the case the strategy is for. */
const museum = {
  id: 'p-museum',
  tripId: TRIP_ID,
  name: 'מוזיאון אדו',
  lat: 35.6963,
  lng: 139.7966,
  ...stamps,
};
const oden = {
  id: 'p-oden',
  tripId: TRIP_ID,
  name: 'אודן קאשימה',
  lat: 35.6963 + 300 / 111_320,
  lng: 139.7966,
  ...stamps,
};
const farAway = {
  id: 'p-far',
  tripId: TRIP_ID,
  name: 'קמאקורה',
  lat: 35.31,
  lng: 139.55,
  ...stamps,
};

const event = (id: string, date: string, placeId: string) => ({
  id,
  tripId: TRIP_ID,
  date,
  title: id,
  icon: '📌',
  category: 'sightseeing',
  placeId,
  kind: 'soft',
  status: 'planned',
  startsAt: `${date}T05:00:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
});

/** Dateless, with a place — the only shape `fits-a-day` speaks about. */
const idea = {
  id: 'm-oden',
  tripId: TRIP_ID,
  title: 'אודן קאשימה',
  icon: '🍜',
  category: 'food',
  placeId: 'p-oden',
  consumed: false,
  createdBy: 'u1',
  ...stamps,
};

async function boot(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await bootIntoTrip(page, {
    // Day 1 stops far from the idea; day 4 stops beside it.
    events: [event('ev-day1', DAY_1, 'p-far'), event('ev-day4', DAY_4, 'p-museum')],
    // A second, placeless idea so the POOL still has content after the first one is aimed at a
    // day — which is what makes the shelf render its two group headers, and so what lets this
    // spec tell "in the day's group" from "still in the pool" at all.
    maybeItems: [idea, { ...idea, id: 'm-bare', title: 'רעיון בלי מקום', placeId: undefined }],
    places: [museum, oden, farAway],
    now: todayAt('02:00'),
    dates: { startDate: DAY_1, endDate: iso(6) },
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();
}

const tile = (page: Page) => page.locator('.wp-maybecard.compact', { hasText: 'אודן קאשימה' });

test.describe('a dateless idea on day 1', () => {
  test.beforeEach(({ page }) => boot(page));

  // The whole point: on a day it is NOT near, it used to have nothing to say.
  test('says which day it fits, with the distance', async ({ page }) => {
    const meta = tile(page).locator('.wp-maybecard-meta');
    await expect(meta).toBeVisible();
    // The day, relative (ADR-0085's phrasing), and how far — but NOT the stop's name, which
    // wraps this line and costs the tile 8px, so it waits for the sheet.
    await expect(meta).not.toContainText('נוסף לאחרונה');
    await expect(meta).not.toContainText('מוזיאון אדו');
    await expect(meta).toContainText('מ׳');
  });

  test('the sheet says the whole sentence, stop and all', async ({ page }) => {
    await tile(page).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('מוזיאון אדו');
  });

  // **Accepting goes to that day.** Without this the feature punishes agreement.
  test('agreeing pencils it in AND lands on the day it named', async ({ page }) => {
    await tile(page).click();
    const agree = page.locator('.wp-row-action', { hasText: 'סמנו ל' });
    await expect(agree).toBeVisible();
    await agree.click();

    // The focused day moved to the one the suggestion named.
    await expect(page).toHaveURL(new RegExp(`day=${DAY_4}`));
    // …and on that day the idea is in the group that shows it — the FIRST strip, the day's own —
    // rather than stranded in the pool, where an idea aimed elsewhere ranks below every dateless
    // one and can leave the strip altogether.
    await expect(page.locator('.shelf-group').first()).toContainText(t.day.shelfForDay);
    await expect(page.locator('.shelf').first()).toContainText('אודן קאשימה');
    // The placeless idea is still in the pool, which is what the two groups mean.
    await expect(page.locator('.shelf').nth(1)).toContainText('רעיון בלי מקום');
  });

  // Undo reverts the WRITE, not the navigation — you are still standing on day 4, which is
  // right: yanking the view back would be a second surprise on top of the first.
  //
  // And that leaves a consequence worth pinning, because it looks like a bug and is not: on
  // day 4 the idea is dateless again and the proposal is SILENT, because `fits-a-day` never
  // proposes the day being ranked. "It fits today" is `near-the-day`'s sentence.
  test('one undo puts it back in the pool, and the proposal goes quiet on the day it named', async ({
    page,
  }) => {
    await tile(page).click();
    await page.locator('.wp-row-action', { hasText: 'סמנו ל' }).click();
    await expect(page).toHaveURL(new RegExp(`day=${DAY_4}`));
    await page.locator('.toast').getByRole('button').click();

    // No longer pencilled in for this day — and with nothing pencilled in, the shelf drops its
    // group headers altogether (one strip needs none), which is the shape to assert rather than
    // a header that says something else.
    await expect(page.locator('.shelf-group')).toHaveCount(0);
    await expect(tile(page)).toBeVisible();
    await tile(page).click();
    await expect(page.locator('.wp-row-action', { hasText: 'סמנו ל' })).toHaveCount(0);
  });
});

test('an idea with no place is offered no day, because nothing was measured', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await bootIntoTrip(page, {
    events: [event('ev-day4', DAY_4, 'p-museum')],
    maybeItems: [{ ...idea, id: 'm-bare', placeId: undefined }],
    places: [museum],
    now: todayAt('02:00'),
    dates: { startDate: DAY_1, endDate: iso(6) },
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'יום-יום' }).click();

  await tile(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.wp-row-action', { hasText: 'סמנו ל' })).toHaveCount(0);
});
