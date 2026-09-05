// **A SHEET IS BOUNDED BY THE SCREEN** (ADR-0219 §6's 2026-09-05 amendment; owner: _"when there's
// too much content the top is cut off"_).
//
// `.modal-overlay` is a flex box and the sheet variant is `align-items: flex-end`, so a card taller
// than the viewport overflows past the START edge — where there is no scrollbar, no gesture and
// nothing to scroll to. The head, the title and `עריכה` are simply not on the screen, and no unit
// test can see it: jsdom loads no CSS, resolves no `100dvh` and reports every rect as zero, so the
// card's height, the overlay's alignment and the direction of the overflow are all invisible there.
//
// Nothing reported it while every sheet in the app was a FORM — `.modal-form` caps its own body at
// 75dvh — and the read surfaces have no such body. ADR-0219 §6 then put a photograph and a summary
// at the top of one.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { stableBox } from './measure';
import { t } from '../src/i18n/he';

/** ADR-0017's floor: the smallest screen the app supports is where a sheet runs out of room. */
test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 640 } });

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const DAY = new Date().toISOString().slice(0, 10);

/** Long enough that the read cannot fit 640px however it is laid out — the read's own blocks, at
 *  the counts a real trip reaches. */
const NOTES = Array.from({ length: 6 }, (_, i) => ({
  id: `n-${i}`,
  tripId: TRIP_ID,
  eventId: 'ev-1',
  body: `שורה ${i} של טקסט שממלאת את הפתק ומאריכה את הקריאה כדי שהיריעה תגלוש מעבר למסך.`,
  source: 'member',
  createdBy: 'u1',
  ...stamps,
}));

const EVENT = {
  id: 'ev-1',
  tripId: TRIP_ID,
  date: DAY,
  title: 'ביקור במגדל',
  icon: '📌',
  category: 'sightseeing',
  placeId: 'p-1',
  kind: 'hard',
  status: 'planned',
  startsAt: `${DAY}T09:00:00.000Z`,
  endsAt: `${DAY}T12:00:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

async function openRead(page: Page) {
  await bootIntoTrip(page, {
    events: [EVENT],
    places: [
      { id: 'p-1', tripId: TRIP_ID, name: 'Tokyo Skytree', lat: 35.7, lng: 139.8, ...stamps },
    ],
    notes: NOTES,
    now: todayAt('08:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  // Plan mode, because that is where a tap on the row IS the read (ADR-0178 §1, and
  // `e2e/plan-row-tap.spec.ts`'s subject) — the sheet under test is the same `DetailSheet`
  // whichever surface opened it.
  await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });
  // A finger, not a mouse: the row's tap is arbitrated as touch (`e2e/plan-row-tap.spec.ts`).
  const box = await stableBox(page.locator('.bld').first());
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 5);
  await expect(page.locator('.bk-detail')).toBeVisible({ timeout: 20_000 });
  // **Wait for the sheet to ARRIVE, not merely to exist.** It rises from the bottom edge, so a
  // box read on the way up is a real box at a position the surface is leaving — and `stableBox`
  // cannot save you here, since an eased tail produces two equal samples while the card is still
  // travelling. The animation's own promise is the only honest signal.
  await page
    .locator('.modal-overlay .modal-card')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

test.describe('a long read sheet', () => {
  test('keeps its top on the screen, and scrolls instead of overflowing off it', async ({
    page,
  }) => {
    await openRead(page);
    const card = await stableBox(page.locator('.modal-overlay .modal-card'));
    const metrics = await page.evaluate(() => {
      const el = document.querySelector('.modal-overlay .modal-card') as HTMLElement;
      return {
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
      };
    });

    // **The report, first**: unbounded, this card is 738px tall on a 640px screen and sits at
    // y = −98. Asserting the precondition ahead of it would fail on the missing scroller instead
    // and name the mechanism rather than the symptom.
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(640);
    // The precondition, stated: this fixture really is longer than the screen. Without it the
    // assertions above pass on a sheet that never had a problem.
    expect(metrics.scrollH).toBeGreaterThan(metrics.clientH);
    // …and the overflow has somewhere to go, which is what makes the bound honest rather than a
    // clip: a card capped without a scroller would hide the foot instead of the head.
    expect(metrics.overflowY).toBe('auto');
  });

  test('opens with the head first, and reaches the foot by scrolling', async ({ page }) => {
    await openRead(page);
    const head = await stableBox(page.locator('.bk-head'));
    const card = await stableBox(page.locator('.modal-overlay .modal-card'));
    // The read opens at its beginning: the badge and the title are the first thing on it.
    expect(head.y).toBeGreaterThanOrEqual(card.y);
    expect(head.y).toBeLessThan(card.y + 200);

    await page.evaluate(() => {
      const el = document.querySelector('.modal-overlay .modal-card') as HTMLElement;
      el.scrollTop = el.scrollHeight;
    });
    const notes = page.locator('.bk-detail .note-sec, .bk-detail .wp-listrow').last();
    await expect(notes).toBeInViewport();
  });
});
