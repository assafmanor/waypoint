// **On All Trips the share entry is a HOLD, and there is no control** (ADR-0033's 2026-08-30
// amendment §1). The visible icon shipped first and the owner reported what it cost: _"The
// share icon is taking much space and is causing a line overflow. Perhaps we need a long
// click instead?"_ — 42px of a 152px content column at 360px, with the meta on three lines.
//
// This file is in a real browser because everything the gesture can get wrong lives there.
// jsdom has no `PointerEvent` and reports every rect as zero, so the unit spec can assert the
// hold fires and nothing about the two things that actually break: the click that lands on
// RELEASE (unswallowed, it opens the trip the hold just shared) and the width the row got
// back.
import { expect, test } from '@playwright/test';
import { bootIntoAllTrips } from './boot';
import { stableBox } from './measure';
import { DRAG_HOLD_MS } from '../src/constants';
import { t } from '../src/i18n/he';

const PHONE = { width: 360, height: 640 };

// Both list shapes: the live trip's hero and an upcoming trip's row (`AllTrips.tsx`).
const SHAPES = [
  { name: 'the live hero', card: '.trip-hero' },
  { name: 'an upcoming row', card: '.trip-card' },
];

/** The shell's arrival transition translates `.route-shell` (ADR-0140), and a box measured
 *  mid-transform comes back off by float noise. Settle it rather than rounding the
 *  assertion, so what is measured is the layout and not a frame. */
async function settled(page: import('@playwright/test').Page) {
  // Polled rather than awaited on `animation.finished`: the shell is keyed on the pathname,
  // so the boot's own navigation replaces the node and rejects that promise with an
  // AbortError. A finished CSS animation with no fill mode leaves the list by itself.
  await page.waitForFunction(
    () => (document.querySelector('.route-shell')?.getAnimations().length ?? 1) === 0,
  );
}

/** Press and keep pressing. Past `DRAG_HOLD_MS` by a margin the box's own scheduling can eat,
 *  then release — the release is the half that matters, so it is never skipped. */
async function hold(page: import('@playwright/test').Page, selector: string) {
  const box = await stableBox(page.locator(selector).first());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(DRAG_HOLD_MS + 200);
  await page.mouse.up();
}

for (const shape of SHAPES) {
  test(`holding ${shape.name} opens the share sheet, and the release does not open the trip`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await bootIntoAllTrips(page);
    await settled(page);

    await hold(page, shape.card);
    await expect(page.getByText(t.share.owner.title)).toBeVisible();

    // **The gesture's own tail must not also navigate.** A hold fires with the finger still
    // down, so the click that lands on release would otherwise reach the card underneath and
    // open the trip behind the sheet — `useHoldToOpen`'s `armClickSwallow`, and the one thing
    // in this feature that no unit test can see.
    await expect(page).toHaveURL(/\/trips$/);
  });
}

test('a tap still opens the trip, and the row carries no share control', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await bootIntoAllTrips(page);
  await settled(page);

  // The gesture costs the row nothing — that is the whole point of choosing it.
  await expect(page.locator('.trip-share-action')).toHaveCount(0);

  await page.locator('.trip-hero').click();
  await expect(page).not.toHaveURL(/\/trips$/);
});

// **The height is the honest witness for the width.** The reported defect was a meta line
// wrapping, so what has to be true is that it stops wrapping — and a card that no longer
// reserves a 56px column is a card whose meta fits. The mockup measured the shipped one at
// 104px and three lines at 360px; this fixture (no member count) lands at 74px and one. The
// bound is loose on purpose: it must fail a returning third line, not a font revision.
test('the meta no longer wraps the card open at 360px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await bootIntoAllTrips(page);
  await settled(page);

  const card = await stableBox(page.locator('.trip-card').first());
  expect(Math.round(card.height)).toBeLessThanOrEqual(90);

  // Nothing overlays the card any more, so its content runs to its own padding: the title
  // starts within a flag's width of the inline (RTL: right) edge and the countdown is the
  // only tenant of the trailing side.
  const main = await stableBox(page.locator('.trip-card .main').first());
  const chip = await stableBox(page.locator('.trip-card .chip.soon').first());
  expect(main.x).toBeGreaterThan(chip.x + chip.width);
});
