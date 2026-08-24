// Browser-contract e2e for **the whole Plan day row opening the read** (owner report,
// 2026-08-24). The row's tap has been a read since ADR-0174 §4, but only the title line
// carried it: `.bld-main` is ONE cell of the grid ADR-0178 §1 laid out, so the row's
// padding, the badge's column and the free width beside the when line answered nothing.
//
// **It can only be asked here, and the first attempt at the fix is why.** A hit layer
// stretched over the card from the button — the trade `button.bld-time::after` already
// makes one slot over — passes every test jsdom can run and fails on a finger: a tap is
// arbitrated against each candidate's own layout box, so the layer loses to `.bld`, whose
// box contains the point outright and which is a candidate itself (the drag's pointer
// handlers make it one). Both layers were tried against the taps below — a `::after`, then
// a real child span — and both read the same: `elementFromPoint` returned the layer at every
// point in the card while every tap outside the title still dispatched its click to `.bld`.
// The chip's own ±8px does still land on the chip, which the last test here keeps: a few px
// out it is the nearest candidate, and that is the difference between expanding a target and
// covering its neighbours.
//
// So every assertion below is a real tap and a real sheet, never a computed hit test.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';
import { t } from '../src/i18n/he';

// Phone-sized and touch-capable: the row's geometry is the subject and ADR-0017 measures
// it on the phone, where `hasTouch` is also what makes the browser arbitrate a tap at all.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const TODAY = new Date().toISOString().slice(0, 10); // trip timezone is UTC
const SOFT_TITLE = 'ארוחת ערב';

const HARD_TITLE = 'טיסה לפרנקפורט';

const EVENTS = [
  {
    id: 'ev-hard',
    tripId: 't1',
    date: TODAY,
    title: HARD_TITLE,
    kind: 'hard',
    status: 'planned',
    source: 'manual',
    sortOrder: 0,
    startsAt: `${TODAY}T09:00:00.000Z`,
    endsAt: `${TODAY}T11:00:00.000Z`,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 'ev-soft',
    tripId: 't1',
    date: TODAY,
    title: SOFT_TITLE,
    kind: 'soft',
    status: 'planned',
    source: 'manual',
    sortOrder: 1,
    startsAt: `${TODAY}T19:00:00.000Z`,
    endsAt: `${TODAY}T20:30:00.000Z`,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
];

const row = (page: Page) => page.locator('.builder-main .bld.soft').first();
/** The read a tap on the card opens (`EventDetail` → `DetailSheet`). */
const read = (page: Page) => page.locator('.bk-detail');

async function boot(page: Page) {
  // Pinned like the shelf and hold specs: the builder's shape depends on the day's phase,
  // so an unpinned run is a different page after midnight UTC.
  await bootIntoTrip(page, { events: EVENTS, now: todayAt('15:00'), dates: shortLiveTripDates() });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });
  await expect(row(page)).toContainText(SOFT_TITLE);
}

/** Tap the centre of a control the way a finger does — `.click()` is a mouse, and this row
 *  is arbitrated as touch. */
async function tapCentre(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('the whole Plan day row is the read', () => {
  // The report, point by point. RTL: the inline-start edge is the RIGHT one, which is where
  // the badge's column is — an inert badge is part of the card's tap, not a control on it.
  test('a tap anywhere on the card opens the read', async ({ page }) => {
    await boot(page);
    const box = (await row(page).boundingBox())!;

    const points: [string, number, number][] = [
      ['the padding above the title', box.x + box.width / 2, box.y + 5],
      ['the free width beside the when line', box.x + box.width / 2, box.y + box.height - 12],
      ['the badge column', box.x + box.width - 18, box.y + box.height / 2],
      ['the padding below the badge', box.x + box.width - 40, box.y + box.height - 6],
    ];

    for (const [where, x, y] of points) {
      await page.touchscreen.tap(x, y);
      await expect(read(page), `a tap on ${where} opens the read`).toBeVisible();
      await expect(read(page)).toContainText(SOFT_TITLE);
      await page.keyboard.press('Escape');
      await expect(read(page)).toHaveCount(0);
    }
  });

  // A hard row answers a press-and-hold with a refusal rather than a drag (ADR-0199), and
  // that is the OTHER props object on the same element — so the card's tap is asserted on
  // both kinds rather than on whichever one the fixture happened to put first.
  test('a hard row opens the same way', async ({ page }) => {
    await boot(page);
    const box = (await page.locator('.builder-main .bld:not(.soft)').first().boundingBox())!;

    await page.touchscreen.tap(box.x + box.width / 2, box.y + 5);

    await expect(read(page)).toBeVisible();
    await expect(read(page)).toContainText(HARD_TITLE);
  });

  // The card opens from the row itself, so every control ON it has to answer first — the
  // regression this guards is "the row opens no matter what I press", which would be worse
  // than the bug it replaced.
  test("the row's time opens the position picker, not the read", async ({ page }) => {
    await boot(page);

    await tapCentre(page, '.bld.soft button.bld-time');

    await expect(page.locator('.slotpick')).toBeVisible();
    await expect(read(page)).toHaveCount(0);
  });

  // The bound in the header, pinned rather than asserted: a few px outside its own box the
  // chip is still the nearest candidate, so ADR-0161 §7's expanded target is untouched by
  // any of this — and a session reading that paragraph can see which half is which.
  test("the time chip's expanded target still reaches the chip", async ({ page }) => {
    await boot(page);
    const chip = (await page.locator('.bld.soft button.bld-time').boundingBox())!;

    await page.touchscreen.tap(chip.x + chip.width / 2, chip.y - 5);

    await expect(page.locator('.slotpick')).toBeVisible();
    await expect(read(page)).toHaveCount(0);
  });

  test("the row's ⋯ opens the action sheet, not the read", async ({ page }) => {
    await boot(page);

    await tapCentre(page, '.bld.soft .bld-icon');

    await expect(page.getByRole('button', { name: t.actions.edit })).toBeVisible();
    await expect(read(page)).toHaveCount(0);
  });
});
